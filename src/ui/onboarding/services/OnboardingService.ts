import { uploadFileToPrivos } from '../PrivosApi';

export class OnboardingService {
    /**
     * Xử lý dữ liệu form từ Mini App:
     * 1. Upload ảnh (nếu có) lên PrivOS, lấy URL
     * 2. Tạo Markdown
     * 3. Upload Markdown lên PrivOS
     */
    static async handleOnboardingSubmission(data: any): Promise<{ success: boolean; message: string }> {
        try {
            const hrRoomId = process.env.HR_ROOM_ID;
            if (!hrRoomId) {
                throw new Error("Missing HR_ROOM_ID in .env");
            }

            let photoUrl = '';
            
            // Nếu UI có gửi ảnh dưới dạng base64
            if (data.idPhotoBase64 && data.idPhotoFilename) {
                console.log(`[OnboardingService] Bắt đầu upload ảnh: ${data.idPhotoFilename}`);
                
                // base64 format: data:image/png;base64,iVBORw0KGgo...
                const matches = data.idPhotoBase64.match(/^data:(.+);base64,(.+)$/);
                let buffer: Buffer;
                let mimeType = 'image/png';
                
                if (matches && matches.length === 3) {
                    mimeType = matches[1];
                    buffer = Buffer.from(matches[2], 'base64');
                } else {
                    buffer = Buffer.from(data.idPhotoBase64, 'base64');
                }
                
                const uploadResult = await uploadFileToPrivos(buffer, data.idPhotoFilename, mimeType, hrRoomId);
                
                // Trích xuất URL ảnh từ file vừa upload
                if (uploadResult?.message?.file?._id) {
                    // API PrivOS trả về ID file
                    const fileId = uploadResult.message.file._id;
                    const privosUrl = process.env.PRIVOS_URL;
                    photoUrl = `${privosUrl}/file-upload/${fileId}/${data.idPhotoFilename}`;
                    console.log(`[OnboardingService] Upload ảnh thành công. URL: ${photoUrl}`);
                }
            }

            // Tạo file Markdown từ dữ liệu
            const markdownContent = this.generateMarkdown(data, photoUrl);
            
            // Đặt tên file MD
            const dateStr = new Date().toISOString().split('T')[0];
            const cleanName = this.removeVietnameseTones(data.fullName || 'KhongTen').replace(/\s+/g, '_');
            const cleanPos = this.removeVietnameseTones(data.position || 'KhongViTri').replace(/\s+/g, '_');
            const mdFilename = `${dateStr}_CV_${cleanName}_${cleanPos}.md`;
            
            console.log(`[OnboardingService] Tạo file MD: ${mdFilename}`);
            
            // Upload file Markdown lên PrivOS
            await uploadFileToPrivos(markdownContent, mdFilename, 'text/markdown', hrRoomId);
            
            console.log(`[OnboardingService] Hoàn thành lưu hồ sơ: ${data.fullName}`);
            return { success: true, message: `Hồ sơ ${data.fullName} đã được lưu thành công vào phòng HR.` };
        } catch (error: any) {
            console.error('[OnboardingService] Error:', error);
            return { success: false, message: error.message };
        }
    }

    private static generateMarkdown(data: any, photoUrl: string): string {
        return `
# HỒ SƠ ỨNG VIÊN TRÚNG TUYỂN

**Vị trí ứng tuyển:** ${data.position || ''}
**Ngày Onboarding:** ${data.onboardingDate || ''}

---

## 1. THÔNG TIN CÁ NHÂN
- **Họ và Tên (Full name):** ${data.fullName || ''}
- **Ngày Sinh (DOB):** ${data.dob || ''}
- **CMND / CCCD (ID/Passport):** ${data.idNumber || ''}
- **Ngày Cấp (Issue Date):** ${data.idIssueDate || ''}
- **Nơi Cấp (Place):** ${data.idIssuePlace || ''}
- **Địa Chỉ Thường Trú (Permanent Address):** ${data.permanentAddress || ''}
- **Chỗ Ở Hiện Tại (Current Address):** ${data.currentAddress || ''}

## 2. THÔNG TIN PHƯƠNG TIỆN
- **Biển Số Xe (License plate):** ${data.vehiclePlate || ''}
- **Loại Xe (Type of vehicle):** ${data.vehicleType || ''}

## 3. THÔNG TIN BẢO HIỂM
- **Số Sổ BHXH (Social Insurance book number):** ${data.socialInsurance || ''}

## 4. THÔNG TIN TÀI CHÍNH
- **Mã Số Thuế Cá Nhân (PIT):** ${data.taxCode || ''}
- **Số Tài Khoản NH (Bank account No.):** ${data.bankAccount || ''}
- **Ngân Hàng / Chi Nhánh (Bank / Branch):** ${data.bankName || ''}
- **Ví Điện Tử Momo (nếu có):** ${data.momoWallet || ''}

## 5. LIÊN HỆ & BẢO MẬT
- **Email:** ${data.email || ''}
- **Số Điện Thoại (Phone No.):** ${data.phone || ''}
- **Tài khoản Telegram cá nhân:** ${data.telegram || ''}
- **Mật khẩu (Password cho CRM/Email):** ${data.password || 'Đã ẩn'}
- **Liên Hệ Khẩn Cấp (Emergency contact):** ${data.emergencyContact || ''}

---
## HÌNH ẢNH CÁ NHÂN / CMND:
${photoUrl ? `![ID Photo](${photoUrl})` : '*Chưa đính kèm ảnh*'}
        `.trim();
    }

    private static removeVietnameseTones(str: string): string {
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }
}
