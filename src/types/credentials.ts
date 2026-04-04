export type CredentialType =
  | "login"
  | "app_password"
  | "api_key"
  | "wifi"
  | "secure_note";

export interface CredentialListItem {
  id: string;
  cred_type: CredentialType;
  name: string;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginData {
  service_name: string;
  url: string;
  username: string;
  password: string;
}

export interface AppPasswordData {
  app_name: string;
  password: string;
  linked_account: string;
}

export interface ApiKeyData {
  service: string;
  key: string;
  secret: string;
  environment: string;
}

export interface WifiData {
  ssid: string;
  password: string;
  security_type: string;
}

export interface SecureNoteData {
  title: string;
  body: string;
}

export type CredentialData =
  | LoginData
  | AppPasswordData
  | ApiKeyData
  | WifiData
  | SecureNoteData;

export interface CredentialDetail {
  id: string;
  cred_type: CredentialType;
  name: string;
  data: string; // JSON string
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export const credTypeLabels: Record<CredentialType, string> = {
  login: "Login",
  app_password: "App Password",
  api_key: "API Key",
  wifi: "Wi-Fi",
  secure_note: "Secure Note",
};

export const credTypeIcons: Record<CredentialType, string> = {
  login: "\uD83C\uDF10",
  app_password: "\uD83D\uDCF1",
  api_key: "\uD83D\uDD11",
  wifi: "\uD83D\uDCF6",
  secure_note: "\uD83D\uDCDD",
};
