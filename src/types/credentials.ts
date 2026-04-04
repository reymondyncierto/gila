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
  search_index: string;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

/** Extract domain from search_index (e.g., "google.com" from "google.com google.com user@gmail.com") */
export function extractDomain(searchIndex: string): string {
  // Look for a domain-like pattern (word.word)
  const match = searchIndex.match(/\b([a-z0-9-]+\.[a-z]{2,})\b/i);
  return match ? match[1] : "";
}

/** Extract email from search_index */
export function extractEmail(searchIndex: string): string {
  const match = searchIndex.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : "";
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
