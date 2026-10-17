import { addIcons } from 'ionicons';
import {
  addOutline, airplaneOutline, alertCircleOutline, arrowBackOutline, arrowDownOutline, arrowForwardOutline, arrowUpOutline,
  bookOutline, briefcaseOutline, businessOutline, calculatorOutline, carOutline, cardOutline, cartOutline, cashOutline, checkmarkCircleOutline,
  chevronForwardOutline, cloudUploadOutline, constructOutline, copyOutline, createOutline, cutOutline, documentTextOutline,
  fingerPrintOutline, fitnessOutline, flashOutline, giftOutline, homeOutline, laptopOutline, leafOutline, lockClosedOutline,
  logOutOutline, medkitOutline, openOutline, pawOutline, peopleOutline, personOutline, phonePortraitOutline, receiptOutline,
  restaurantOutline, schoolOutline, shieldCheckmarkOutline, shirtOutline, sparklesOutline, swapHorizontalOutline,
  trashOutline, trendingUpOutline, tvOutline, walletOutline, waterOutline, wifiOutline,
} from 'ionicons/icons';
import { ICON_NAMES } from '../../domain/icon-catalog';

/** Ícones sugeridos primeiro no seletor de dívidas. */
export const DEBT_ICONS = ['car-outline', 'card-outline', 'home-outline', 'school-outline', 'medkit-outline', 'phone-portrait-outline', 'cash-outline', 'receipt-outline'];
export const ALL_ICONS = ICON_NAMES;

export function registerIcons(): void {
  addIcons({
    addOutline, airplaneOutline, alertCircleOutline, arrowBackOutline, arrowDownOutline, arrowForwardOutline, arrowUpOutline,
    bookOutline, briefcaseOutline, businessOutline, calculatorOutline, carOutline, cardOutline, cartOutline, cashOutline, checkmarkCircleOutline,
    chevronForwardOutline, cloudUploadOutline, constructOutline, copyOutline, createOutline, cutOutline, documentTextOutline,
    fingerPrintOutline, fitnessOutline, flashOutline, giftOutline, homeOutline, laptopOutline, leafOutline, lockClosedOutline,
    logOutOutline, medkitOutline, openOutline, pawOutline, peopleOutline, personOutline, phonePortraitOutline, receiptOutline,
    restaurantOutline, schoolOutline, shieldCheckmarkOutline, shirtOutline, sparklesOutline, swapHorizontalOutline,
    trashOutline, trendingUpOutline, tvOutline, walletOutline, waterOutline, wifiOutline,
  });
}
