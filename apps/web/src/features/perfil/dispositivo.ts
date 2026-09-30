import { UAParser } from 'ua-parser-js';

// Nombre legible del dispositivo de una sesión ("Chrome en Windows"); si no se reconoce, el user agent
// recortado a 60 caracteres (ADR 0018 punto 9).
export function nombreDispositivo(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const { browser, os } = new UAParser(userAgent).getResult();
  if (browser.name && os.name) return `${browser.name} en ${os.name}`;
  if (browser.name) return browser.name;
  return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
}
