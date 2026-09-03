---
name: cv-evaluator
description: "Kỹ năng chuyên biệt dùng để phân tích, chấm điểm CV ứng viên và đánh giá chuyên sâu (Deep Review) dựa trên Job Description (JD). Kích hoạt khi người dùng yêu cầu 'chấm CV', 'đánh giá CV', 'sàng lọc ứng viên' hoặc 'deep review'."
---

# Kỹ năng Đánh giá CV (CV Evaluator Skill)

Kỹ năng này giúp chuẩn hóa toàn bộ quy trình từ lúc nhận CV thô, phân tích nội dung, chấm điểm dựa trên JD và lưu trữ kết quả phân tích một cách có cấu trúc vào thư mục báo cáo.

## 1. Triggers (Khi nào sử dụng)
Sử dụng kỹ năng này khi có yêu cầu:
- Chấm điểm CV sơ loại ("Chấm CV này", "Sàng lọc ứng viên").
- Đánh giá chuyên sâu một CV đã qua sơ loại ("Deep review CV này", "Đánh giá chuyên sâu").

## 2. Dependencies (Tài liệu tham khảo bắt buộc)
Trước khi bắt đầu, BẠN BẮT BUỘC PHẢI TÌM VÀ ĐỌC các file hướng dẫn sau đây trong workspace (thường nằm ở `hr-miniapp/skills/` hoặc tuân theo người dùng chỉ định):
1. `@Files:[ROOM_ID]/hr-miniapp/skills/cv_processing_guidelines.md`: Quy trình và đường dẫn thư mục chuẩn (VD: lưu vào `02-passed_screening` hay `03-deep_reviewed`).
2. `@Files:[ROOM_ID]/hr-miniapp/skills/cv_md_template.md`: Cấu trúc bắt buộc của file kết quả Markdown.
3. `@Files:[ROOM_ID]/hr-miniapp/skills/sang_loc_cv.md` (hoặc JD cụ thể): Tiêu chí chấm điểm và đánh giá.

Nếu không tìm thấy các file trên, hãy yêu cầu người dùng cung cấp đường dẫn đến các file hướng dẫn nghiệp vụ trước khi tiến hành chấm CV.

## 3. Workflow (Quy trình thực thi)

Dựa trên yêu cầu của người dùng (Sơ loại hay Deep Review), hãy áp dụng logic sau:

### Phase 1: Phân loại yêu cầu
- Nếu yêu cầu là sơ loại (Screening): Mục tiêu là quyết định ĐẠT / CÂN NHẮC / KHÔNG ĐẠT. File kết quả sẽ được lưu vào `02-passed_screening/` hoặc `01-failed/` tương ứng.
- Nếu yêu cầu là đánh giá chuyên sâu (Deep Review): Mục tiêu là phân tích chi tiết kỹ năng, tính cách, kinh nghiệm (dựa trên các câu hỏi phỏng vấn, bài test...). File kết quả BẮT BUỘC lưu vào thư mục `03-deep_reviewed/`.

### Phase 2: Lưu trữ File Gốc (BẮT BUỘC)
- ⚠️ **SYSTEM DIRECTIVE:** BẠN BẮT BUỘC PHẢI THỰC HIỆN "BƯỚC 1" TRONG FILE GUIDELINES TRƯỚC TIÊN.
- Đổi tên tất cả các CV gốc theo chuẩn và copy toàn bộ vào thư mục `hr-miniapp/raws-cv/[YYYY-MM]/`. 
- Tuyệt đối không được bỏ sót bất kỳ file CV nào do người dùng tải lên.

### Phase 3: Đọc dữ liệu & Phân tích
- Đọc bản text MD của CV từ thư mục ẩn (nếu có) hoặc yêu cầu người dùng trích xuất.
- Đọc nội dung Job Description (JD).
- So khớp kỹ năng, kinh nghiệm trong CV với JD. Đưa ra điểm số (Ví dụ: 85/100).
- Lập bảng phân tích ưu/nhược điểm khách quan, không bịa đặt (No Hallucination).

### Phase 4: Lưu trữ Kết Quả (BẮT BUỘC)
- ⚠️ **SYSTEM DIRECTIVE:** LƯU FILE KẾT QUẢ VÀ TỔNG HỢP CSV THEO ĐÚNG "BƯỚC 4" VÀ "BƯỚC 5" CỦA GUIDELINES. BẠN SẼ BỊ ĐÁNH GIÁ LÀ THẤT BẠI NẾU KHÔNG CẬP NHẬT CSV.
1. **Lưu file Markdown**: Sinh ra file Markdown kết quả đúng chuẩn `cv_md_template.md`. Tên file có dạng `[YYYY-MM-DD]_CV_[TenKhongDau]_[ViTriKhongDau].md`. 
   - Đảm bảo lưu đúng thư mục (VD: `outputs-cv/[YYYY-MM]/03-deep_reviewed/` cho Deep Review).
   - Nếu file đã tồn tại, tự động thêm hậu tố `_1`, `_2` để chống ghi đè.
2. **Cập nhật báo cáo CSV (TỐI QUAN TRỌNG)**: Ghi NỐI (Append) đúng 1 dòng dữ liệu gồm 4 cột (`Vị trí, Tổng điểm, Kết quả, Đường dẫn file MD`) vào file CSV báo cáo của tháng nằm trong thư mục `hr-miniapp/outputs-cv/[YYYY-MM]/reports/`. KHÔNG được thay đổi Header của CSV.
3. **Trả về kết quả**: Hoàn tất bằng cách báo cho người dùng đường dẫn file Markdown đã lưu dưới dạng `<saved_file>đường_dẫn</saved_file>`. Không in toàn bộ Markdown ra màn hình chat để tiết kiệm token.

## 4. Nguyên tắc cốt lõi
- **Tuyệt đối không bịa thông tin**: Những gì không có trong CV thì ghi "Không đề cập".
- **Tuân thủ DI (Dependency Injection)**: Mọi tiêu chí chấm điểm phải được nạp từ file JD và Guidelines, không hardcode tiêu chí chấm điểm trong logic của bạn.
- **Hành động thầm lặng**: Ưu tiên việc tạo/sửa file trực tiếp trên workspace thay vì giải thích dông dài.
