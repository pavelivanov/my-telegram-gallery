export interface TelegramUserRef {
  id: number;
}

export interface TelegramPreCheckoutQuery {
  id: string;
  from: TelegramUserRef;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  subscription_expiration_date?: number;
  is_recurring?: true;
  is_first_recurring?: true;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number };
  from?: TelegramUserRef;
  text?: string;
  successful_payment?: TelegramSuccessfulPayment;
}

export interface TelegramUpdatePayload {
  update_id: number;
  pre_checkout_query?: TelegramPreCheckoutQuery;
  message?: TelegramMessage;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}
