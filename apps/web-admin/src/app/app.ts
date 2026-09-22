import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from './services/admin.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly adminService = inject(AdminService);

  senderInput = signal('Administrador');
  contentInput = signal('');
  targetClientId = signal(''); // '' = Broadcast
  sending = signal(false);

  selectTarget(clientId: string): void {
    this.targetClientId.set(clientId);
  }

  async handlePublish(): Promise<void> {
    const content = this.contentInput().trim();
    const sender = this.senderInput().trim();

    if (!content || !sender) return;

    this.sending.set(true);
    const success = await this.adminService.publishMessage(
      sender,
      content,
      this.targetClientId() || undefined
    );
    this.sending.set(false);

    if (success) {
      this.contentInput.set('');
    }
  }

  reconnect(): void {
    this.adminService.connectAdminSse();
  }
}
