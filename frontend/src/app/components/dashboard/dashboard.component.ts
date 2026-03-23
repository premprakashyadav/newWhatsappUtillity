import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { MessageService } from '../../services/message.service';

interface BulkProgress {
  current: number;
  total: number;
  result: { success: boolean; to: string; error?: string };
}

interface SendResult {
  success: boolean;
  to: string;
  error?: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  phone = '';
  activeTab: 'bulk' | 'single' = 'bulk';

  // Excel upload
  contacts: any[] = [];
  excelFile: File | null = null;
  excelError = '';
  parsingExcel = false;

  // Message form
  message = '';
  imageFile: File | null = null;
  imagePreview = '';

  // Single send
  singlePhone = '';

  // Send state
  sending = false;
  sendProgress = 0;
  sendCurrent = 0;
  sendTotal = 0;
  sendResults: SendResult[] = [];
  sendComplete = false;
  sendError = '';

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private socket: SocketService,
    private msgService: MessageService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.phone = this.auth.phone || '';
    const sessionId = this.auth.sessionId;
    if (!sessionId) { this.router.navigate(['/login']); return; }
    this.socket.connect(sessionId);
    this.subscribeSocketEvents();
  }

  private subscribeSocketEvents(): void {
    this.subs.push(
      this.socket.on<any>('bulk-start').subscribe(data => {
        this.sending = true;
        this.sendTotal = data.total;
        this.sendCurrent = 0;
        this.sendProgress = 0;
        this.sendResults = [];
        this.sendComplete = false;
        this.sendError = '';
      }),
      this.socket.on<BulkProgress>('bulk-progress').subscribe(data => {
        this.sendCurrent = data.current;
        this.sendTotal = data.total;
        this.sendProgress = Math.round((data.current / data.total) * 100);
        this.sendResults.push(data.result);
      }),
      this.socket.on<any>('bulk-complete').subscribe(data => {
        this.sending = false;
        this.sendComplete = true;
        this.sendResults = data.results;
        this.sendProgress = 100;
      }),
      this.socket.on<any>('bulk-error').subscribe(data => {
        this.sending = false;
        this.sendError = data.error;
      }),
      this.socket.on<any>('disconnected').subscribe(() => {
        this.auth.logout().subscribe(() => this.router.navigate(['/login']));
      })
    );
  }

  onExcelUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.excelFile = file;
    this.excelError = '';
    this.parsingExcel = true;
    this.contacts = [];

    this.msgService.parseExcel(file).subscribe({
      next: (res) => {
        this.parsingExcel = false;
        if (res.success) {
          this.contacts = res.contacts;
        } else {
          this.excelError = res.message;
        }
      },
      error: (err) => {
        this.parsingExcel = false;
        this.excelError = err.error?.message || 'Failed to parse Excel';
      }
    });
  }

  onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.imageFile = file;
    const reader = new FileReader();
    reader.onload = () => { this.imagePreview = reader.result as string; };
    reader.readAsDataURL(file);
  }

  sendBulk(): void {
    if (!this.contacts.length || !this.message) return;
    this.msgService.sendBulk(this.contacts, this.message, this.imageFile || undefined, this.auth.sessionId || undefined).subscribe({
      error: (err) => { this.sendError = err.error?.message || 'Failed to start bulk send'; }
    });
  }

  sendSingle(): void {
    if (!this.singlePhone || !this.message) return;
    this.sending = true;
    this.sendError = '';
    this.msgService.sendSingle(this.singlePhone, this.message, this.imageFile || undefined, this.auth.sessionId || undefined).subscribe({
      next: (res) => {
        this.sending = false;
        this.sendComplete = true;
        this.sendResults = [res];
      },
      error: (err) => {
        this.sending = false;
        this.sendError = err.error?.message || 'Failed to send message';
      }
    });
  }

  downloadTemplate(): void { this.msgService.downloadTemplate(); }

  removeImage(): void { this.imageFile = null; this.imagePreview = ''; }
  removeContact(i: number): void { this.contacts.splice(i, 1); }
  resetForm(): void {
    this.sendComplete = false; this.sendResults = []; this.sendProgress = 0;
    this.sendCurrent = 0; this.sendTotal = 0; this.sendError = '';
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }

  get successCount() { return this.sendResults.filter(r => r.success).length; }
  get failedCount() { return this.sendResults.filter(r => !r.success).length; }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }
}
