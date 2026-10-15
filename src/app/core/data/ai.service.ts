import { Injectable, inject } from '@angular/core';
import type { ChartSpec } from '../../../domain/ai-tools';
import { supabase } from '../supabase';
import { HouseholdService } from './household.service';

export type Attachment =
  | { type: 'chart'; chart: ChartSpec }
  | { type: 'formula'; name: string; expression: string; value: number }
  | {
      type: 'simulation';
      debt: string;
      extra: number;
      reduceTerm: { parcelas_restantes: number; juros_economizados: number };
      reducePayment: { nova_parcela: number; juros_economizados: number };
    };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

export interface SavedItem {
  id: string;
  kind: 'chart' | 'formula';
  title: string;
  spec: ChartSpec | { expression: string };
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private household = inject(HouseholdService);

  async send(history: ChatMessage[]): Promise<ChatMessage> {
    const { data, error } = await supabase.functions.invoke('chat', {
      body: {
        household_id: this.household.currentId(),
        // Só texto vai para o servidor; anexos são reconstruídos pela IA quando preciso.
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
    });
    if (error) {
      // A função devolve { error } com mensagem amigável (ex.: limite diário).
      const ctx = (error as { context?: Response }).context;
      const detail = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error(detail?.error ?? 'A IA não respondeu agora. Tente de novo.');
    }
    return { role: 'assistant', content: data.reply ?? '', attachments: data.attachments ?? [] };
  }

  async save(kind: 'chart' | 'formula', title: string, spec: unknown): Promise<void> {
    const { error } = await supabase.from('ai_saved').insert({ household_id: this.household.currentId(), kind, title, spec });
    if (error) throw error;
  }

  async saved(): Promise<SavedItem[]> {
    const { data, error } = await supabase
      .from('ai_saved')
      .select('id,kind,title,spec,created_at')
      .eq('household_id', this.household.currentId() ?? '')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as SavedItem[];
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('ai_saved').delete().eq('id', id);
    if (error) throw error;
  }
}
