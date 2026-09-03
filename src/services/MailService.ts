import dotenv from 'dotenv';
import { TaskQueue } from '../utils/TaskQueue';

dotenv.config();

export interface SendMailParams {
  toName: string;
  toEmail: string;
  subject: string;
  htmlContent: string;
}

export class MailService {
  private queue: TaskQueue;

  constructor() {
    // Khởi tạo hàng đợi với delay 1.5s giữa các lần gửi để chống rate-limit
    this.queue = new TaskQueue({ delayMs: 1500 });
  }

  /**
   * Đưa tác vụ gửi mail vào hàng đợi (Queue)
   */
  public async queueMail(params: SendMailParams): Promise<void> {
    await this.queue.enqueue(() => this.sendMail(params));
  }

  /**
   * Logic gửi mail thực tế qua EmailJS
   */
  private async sendMail(params: SendMailParams): Promise<void> {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;

    if (!serviceId || !templateId || !publicKey) {
      throw new Error('Thiếu biến môi trường EmailJS (EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, hoặc EMAILJS_PUBLIC_KEY).');
    }

    const payload: any = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        name: params.toName,
        to_email: params.toEmail,
        subject: params.subject,
        message: params.htmlContent,
        Tomorow: ''
      }
    };

    if (privateKey) {
      payload.accessToken = privateKey;
    }

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lỗi gửi mail: ${errorText}`);
    }

    console.log(`[MailService] Đã gửi email thành công tới ${params.toEmail}`);
  }
}

// Khởi tạo instance duy nhất (Singleton) để dùng chung 1 queue
export const mailService = new MailService();
