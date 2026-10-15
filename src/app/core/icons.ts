import { addIcons } from 'ionicons';
import {
  addOutline, alertCircleOutline, arrowBackOutline, bookOutline, carOutline, cardOutline, cashOutline,
  checkmarkCircleOutline, chevronForwardOutline, cutOutline, documentTextOutline, homeOutline, lockClosedOutline,
  medkitOutline, peopleOutline, phonePortraitOutline, receiptOutline, schoolOutline, sparklesOutline,
  swapHorizontalOutline, trashOutline, trendingUpOutline, walletOutline, copyOutline, logOutOutline, fingerPrintOutline,
} from 'ionicons/icons';

/** Ícones que o usuário pode escolher para uma dívida. */
export const DEBT_ICONS = ['car-outline', 'card-outline', 'home-outline', 'school-outline', 'medkit-outline', 'phone-portrait-outline', 'cash-outline', 'receipt-outline'];

export function registerIcons(): void {
  addIcons({
    addOutline, alertCircleOutline, arrowBackOutline, bookOutline, carOutline, cardOutline, cashOutline,
    checkmarkCircleOutline, chevronForwardOutline, cutOutline, documentTextOutline, homeOutline, lockClosedOutline,
    medkitOutline, peopleOutline, phonePortraitOutline, receiptOutline, schoolOutline, sparklesOutline,
    swapHorizontalOutline, trashOutline, trendingUpOutline, walletOutline, copyOutline, logOutOutline, fingerPrintOutline,
  });
}
