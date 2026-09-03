import { IPipelineService } from './pipeline-dashboard';
import { CVFile, ProcessingStatus } from './pipeline-service';

// Mock data list
const MOCK_FILES: CVFile[] = [
  { _id: 'mock1', name: 'CV_Nguyen_Van_A_Intern.pdf', size: 1024000 },
  { _id: 'mock2', name: 'CV_Le_Thi_B_Senior.pdf', size: 2048000 }
];

export class MockPipelineService implements IPipelineService {
  
  async ensureTemplatesExist(forceReset?: boolean): Promise<void> {
    console.log('[MOCK] ensureTemplatesExist called', { forceReset });
    return Promise.resolve();
  }

  async fetchAvailableFiles(): Promise<CVFile[]> {
    console.log('[MOCK] fetchAvailableFiles called');
    return Promise.resolve([...MOCK_FILES]);
  }

  async uploadCV(file: File): Promise<CVFile> {
    console.log('[MOCK] uploadCV called', file.name);
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          _id: `mock_up_${Date.now()}`,
          name: file.name,
          size: file.size
        });
      }, 1000);
    });
  }

  async deleteFile(fileId: string): Promise<boolean> {
    console.log('[MOCK] deleteFile called', fileId);
    return Promise.resolve(true);
  }

  async renameFile(fileId: string, newName: string): Promise<boolean> {
    console.log('[MOCK] renameFile called', fileId, newName);
    return Promise.resolve(true);
  }

  async processCV(
    cv: CVFile,
    updateStatus: (s: Partial<ProcessingStatus>) => void,
    jdContent: string,
    jdName: string,
    onLog?: (msg: string) => void
  ): Promise<void> {
    if (onLog) onLog(`[MOCK] Bắt đầu xử lý CV ảo: ${cv.name}`);
    updateStatus({ status: 'renaming' });

    return new Promise(resolve => {
      setTimeout(() => {
        if (onLog) onLog(`[MOCK] Đang chấm điểm...`);
        updateStatus({ status: 'scoring' });
        
        setTimeout(() => {
          const isPass = Math.random() > 0.3; // 70% pass
          const score = isPass ? Math.floor(Math.random() * 20) + 80 : Math.floor(Math.random() * 40) + 30; // 80-100 or 30-70
          
          if (onLog) onLog(`[MOCK] Xử lý xong! Điểm: ${score}`);
          updateStatus({
            status: 'completed',
            normalizedName: `[Mock]_${cv.name}.md`,
            score: score,
            category: isPass ? 'ĐẠT' : 'KHÔNG ĐẠT',
            reason: `[MOCK] Đây là kết quả test ngẫu nhiên.\n\n[BẰNG CHỨNG TỪ CV]\n- Bằng chứng giả lập 1\n- Bằng chứng giả lập 2`
          });
          resolve();
        }, 1500);
      }, 1000);
    });
  }

  async getMarkdownContent(normalizedName: string): Promise<string> {
    console.log('[MOCK] getMarkdownContent called', normalizedName);
    return Promise.resolve(`
# 📄 Thông Tin Ứng Viên: ${normalizedName.replace('.md', '')}

- **Vị trí ứng tuyển:** Mock Position
- **Số điện thoại:** 0123456789
- **Email:** [mock_candidate@gmail.com](mailto:mock_candidate@gmail.com)

## 🎓 Học Vấn
- Đại học Mock - 2026

## 💼 Kinh Nghiệm Làm Việc
- **Công ty Mock** | Dev | 2024-2026

---
## 📊 Đánh giá chi tiết theo tiêu chí JD
...
`);
  }
}
