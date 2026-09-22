import { Injectable, signal, computed } from '@angular/core';
import { AdminNotificationPayload, ClientStatus, ChatMessagePayload } from '@sse-showcase/shared-types';

export type AdminConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface SentHistoryItem {
  id: string;
  sender: string;
  content: string;
  target?: string;
  timestamp: string;
  status: 'sent' | 'failed';
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly API_AUTH_URL = 'http://localhost:3001';
  private readonly API_SSE_URL = 'http://localhost:3002';

  private eventSource: EventSource | null = null;

  readonly status = signal<AdminConnectionStatus>('disconnected');
  readonly clients = signal<ClientStatus[]>([]);
  readonly sentHistory = signal<SentHistoryItem[]>([]);
  readonly notifications = signal<AdminNotificationPayload[]>([]);

  readonly totalClients = computed(() => this.clients().length);
  readonly isConnected = computed(() => this.status() === 'connected');

  constructor() {
    this.connectAdminSse();
  }

  connectAdminSse(): void {
    if (this.status() === 'connected') return;
    this.status.set('connecting');

    try {
      this.eventSource = new EventSource(`${this.API_SSE_URL}/sse/admin`);

      // 1. Recebe lista inicial de clientes
      this.eventSource.addEventListener('initial_clients', (event: MessageEvent) => {
        try {
          const list: ClientStatus[] = JSON.parse(event.data);
          this.clients.set(list);
          this.status.set('connected');
        } catch (e) {
          console.error('[Admin] Erro ao parsear clientes iniciais:', e);
        }
      });

      // 2. Recebe notificações de ciclo de vida (conectar / desconectar)
      this.eventSource.addEventListener('admin_notification', (event: MessageEvent) => {
        try {
          const payload: AdminNotificationPayload = JSON.parse(event.data);
          this.notifications.update((prev) => [payload, ...prev]);

          if (payload.type === 'client:connected') {
            this.clients.update((prev) => {
              const filtered = prev.filter((c) => c.clientId !== payload.client.clientId);
              return [payload.client, ...filtered];
            });
          } else if (payload.type === 'client:disconnected') {
            this.clients.update((prev) =>
              prev.filter((c) => c.clientId !== payload.client.clientId)
            );
          }
        } catch (e) {
          console.error('[Admin] Erro ao parsear notificação:', e);
        }
      });

      this.eventSource.onopen = () => {
        this.status.set('connected');
      };

      this.eventSource.onerror = () => {
        this.status.set('disconnected');
      };

    } catch (err) {
      console.error('[Admin] Falha ao iniciar SSE Admin:', err);
      this.status.set('disconnected');
    }
  }

  async publishMessage(sender: string, content: string, targetClientId?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.API_AUTH_URL}/messages/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender,
          content,
          targetClientId: targetClientId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao despachar');

      const historyItem: SentHistoryItem = {
        id: data.message?.id || String(Date.now()),
        sender,
        content,
        target: targetClientId ? this.getClientName(targetClientId) : 'Todos (Broadcast)',
        timestamp: new Date().toISOString(),
        status: 'sent'
      };

      this.sentHistory.update((prev) => [historyItem, ...prev]);
      return true;
    } catch (err) {
      console.error('[Admin] Erro no envio da mensagem:', err);
      const historyItem: SentHistoryItem = {
        id: String(Date.now()),
        sender,
        content,
        target: targetClientId ? this.getClientName(targetClientId) : 'Todos (Broadcast)',
        timestamp: new Date().toISOString(),
        status: 'failed'
      };
      this.sentHistory.update((prev) => [historyItem, ...prev]);
      return false;
    }
  }

  private getClientName(clientId: string): string {
    const found = this.clients().find((c) => c.clientId === clientId);
    return found ? `${found.clientName} (${found.clientId.slice(0, 6)})` : clientId;
  }
}
