import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  parseExcel(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('excel', file);
    return this.http.post<any>(`${this.apiUrl}/messages/parse-excel`, formData, { withCredentials: true });
  }

  sendBulk(contacts: any[], message: string, image?: File, sessionId?: string): Observable<any> {
    const formData = new FormData();
    formData.append('contacts', JSON.stringify(contacts));
    formData.append('message', message);
    if (image) formData.append('image', image);
    if (sessionId) formData.append('sessionId', sessionId);
    return this.http.post<any>(`${this.apiUrl}/messages/send-bulk`, formData, { withCredentials: true });
  }

  sendSingle(phone: string, message: string, image?: File, sessionId?: string): Observable<any> {
    const formData = new FormData();
    formData.append('phone', phone);
    formData.append('message', message);
    if (image) formData.append('image', image);
    if (sessionId) formData.append('sessionId', sessionId);
    return this.http.post<any>(`${this.apiUrl}/messages/send-single`, formData, { withCredentials: true });
  }

  downloadTemplate(): void {
    window.open(`${this.apiUrl}/messages/sample-template`, '_blank');
  }
}
