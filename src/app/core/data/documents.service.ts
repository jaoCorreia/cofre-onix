import { Injectable, inject, signal } from '@angular/core';
import { DocumentKind, excerptForExtraction, ExtractedDocument, normalizeExtraction, sha256Hex } from '../../../domain/document-extraction';
import { supabase } from '../supabase';
import { HouseholdService } from './household.service';
import { DocumentRow } from './models';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
/** Texto enviado à IA para extração: o suficiente para um contrato, sem mandar o documento inteiro. */
const MAX_TEXT = 12_000;

export class DocumentError extends Error {}

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private household = inject(HouseholdService);
  readonly documents = signal<DocumentRow[]>([]);

  async load(): Promise<void> {
    const hh = this.household.currentId();
    if (!hh) return;
    const { data, error } = await supabase.from('documents').select('*').eq('household_id', hh).order('created_at', { ascending: false });
    if (error) throw error;
    this.documents.set(data as DocumentRow[]);
  }

  validate(file: File): void {
    if (!ALLOWED.includes(file.type)) throw new DocumentError('Envie um PDF ou uma foto (JPG, PNG ou WEBP).');
    if (file.size > MAX_BYTES) throw new DocumentError('O arquivo passa de 10 MB.');
  }

  /**
   * Lê o texto do arquivo no próprio aparelho: PDF com texto pelo pdf.js e foto por OCR
   * (Tesseract). Bibliotecas carregadas só quando o usuário anexa algo.
   */
  async readText(file: File, onProgress?: (msg: string) => void): Promise<string> {
    if (file.type === 'application/pdf') {
      onProgress?.('Lendo o PDF…');
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.mjs'; // copiado por scripts/copy-assets.mjs
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages: string[] = [];
      for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
        const content = await (await pdf.getPage(p)).getTextContent();
        pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
      }
      const text = pages.join('\n').trim();
      if (text.length > 40) return text;
      onProgress?.('O PDF parece ser uma imagem. Tente enviar uma foto da página.');
      return text;
    }
    onProgress?.('Lendo a imagem (pode levar alguns segundos)…');
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('por');
    try {
      const { data } = await worker.recognize(file);
      return data.text.trim();
    } finally {
      await worker.terminate();
    }
  }

  /** Envia só o texto para a IA extrair os campos; o arquivo não sai do aparelho nesta etapa. */
  async extract(text: string): Promise<ExtractedDocument> {
    const { data, error } = await supabase.functions.invoke('chat', {
      body: { household_id: this.household.currentId(), action: 'extract_document', text: excerptForExtraction(text, MAX_TEXT) },
    });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const detail = ctx ? await ctx.json().catch(() => null) : null;
      throw new DocumentError(detail?.error ?? 'Não deu para ler os dados do documento.');
    }
    return normalizeExtraction(data.document);
  }

  /** Guarda o arquivo no bucket privado do lar e registra o documento (deduplicado por hash). */
  async store(file: File, kind: DocumentKind, debtId: string | null): Promise<void> {
    const hh = this.household.currentId();
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
    const path = `${hh}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from('documents').upload(path, buffer, { contentType: file.type, upsert: false });
    if (up.error) throw up.error;
    const { error } = await supabase.from('documents').insert({
      household_id: hh,
      storage_path: path,
      kind,
      sha256: hash,
      debt_id: debtId,
      file_name: file.name.slice(0, 120),
      mime_type: file.type,
      size_bytes: file.size,
    });
    if (error) {
      await supabase.storage.from('documents').remove([path]);
      throw error;
    }
    await this.load();
  }

  async findDuplicate(file: File): Promise<boolean> {
    const hash = await sha256Hex(await file.arrayBuffer());
    const { data } = await supabase.from('documents').select('id').eq('household_id', this.household.currentId() ?? '').eq('sha256', hash).maybeSingle();
    return !!data;
  }

  /** Link temporário (5 min) para abrir o arquivo. */
  async openUrl(doc: DocumentRow): Promise<string> {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 300);
    if (error) throw error;
    return data.signedUrl;
  }

  async remove(doc: DocumentRow): Promise<void> {
    await supabase.storage.from('documents').remove([doc.storage_path]);
    const { error } = await supabase.from('documents').delete().eq('id', doc.id);
    if (error) throw error;
    await this.load();
  }
}
