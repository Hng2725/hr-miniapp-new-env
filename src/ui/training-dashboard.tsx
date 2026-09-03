import { useState, useEffect, useRef } from 'react';
import { usePrivosApp, usePrivosContext, McpApp } from '@privos_ai/app-react';
import { restCall, ensureFolderPath } from './privos-rest';

// ─── Types ───
interface DocFile {
  _id: string;
  name: string;
  size?: number;
}

// ─── Services ───
async function fetchTrainingDocs(app: McpApp, roomId: string): Promise<DocFile[]> {
  try {
    const body = await restCall<any>(app, 'GET', `file-management.files.channel/${roomId}`, {
      query: { count: 100 },
      timeoutMs: 15000
    });
    const list = body?.files ?? body?.data ?? (Array.isArray(body) ? body : []);
    
    return list
      .filter((f: any) => (f.name || '').includes('dao-tao/'))
      .map((f: any) => ({
        _id: f._id,
        name: (f.name || '').split('/').pop() || f.name,
        size: f.size ?? f.file_size,
      }));
  } catch (err) {
    console.error('[Training] fetchTrainingDocs failed:', err);
    return [];
  }
}

async function uploadSingleFile(app: McpApp, roomId: string, file: File, folderId: string | null): Promise<void> {
  const dataUri = await readAsDataUri(file);
  const uploadPromise = app.uploadFile({
    channelId: roomId,
    fileName: file.name,
    ...(folderId ? { folderId } : {}),
    base64Data: dataUri,
    mimeType: file.type || 'text/markdown',
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Upload timeout sau 20s cho file ${file.name}`)), 20000)
  );

  const res: any = await Promise.race([uploadPromise, timeoutPromise]);
  const fileId = res?.file?._id || res?.file?.id || res?._id;
  
  if (!fileId) {
    throw new Error(`Upload failed for ${file.name}: No file ID returned.`);
  }
}

async function uploadTrainingDocs(app: McpApp, roomId: string, files: FileList | File[]): Promise<void> {
  await ensureFolderPath(app, roomId, ['hr-miniapp', 'dao-tao']);

  const foldersResponse: any = await app.callServerTool({
    name: 'privos.folders.search',
    arguments: { channelId: roomId, query: 'dao-tao' }
  });

  let folderId: string | null = null;
  const text = foldersResponse?.content?.[0]?.text;
  if (text) {
    const parsed = JSON.parse(text);
    const folders = Array.isArray(parsed) ? parsed : (parsed?.folders || []);
    const found = folders.find((f: any) => f.name?.toLowerCase() === 'dao-tao');
    folderId = found?._id || null;
  }

  // Upload all files concurrently
  const uploadPromises = Array.from(files).map(file => uploadSingleFile(app, roomId, file, folderId));
  await Promise.all(uploadPromises);
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── Component ───
export default function TrainingDashboard() {
  const app = usePrivosApp();
  const { roomId } = usePrivosContext();

  const [docs, setDocs] = useState<DocFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (app && roomId) {
      loadDocs();
    }
  }, [app, roomId]);

  const loadDocs = async () => {
    if (!app || !roomId) return;
    
    setIsLoadingDocs(true);
    try {
      const fetchedDocs = await fetchTrainingDocs(app, roomId);
      setDocs(fetchedDocs);
    } catch (err) {
      console.error('Failed to load training docs:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !app || !roomId) return;

    setIsUploading(true);
    setStatusMsg(`Đang tải lên ${files.length} file...`);
    
    try {
      await uploadTrainingDocs(app, roomId, files);
      setStatusMsg(`Tải lên thành công ${files.length} file!`);
      await loadDocs();
    } catch (err: any) {
      setStatusMsg(`Lỗi tải file: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!app || !roomId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Đang kết nối đến PrivOS...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
          Tài Liệu Hướng Dẫn
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Quản lý các tài liệu hướng dẫn và onboarding. Hệ thống phân quyền của PrivOS sẽ tự động cho phép nhân viên có thể tra cứu các file này thông qua Bot.
        </p>
      </header>

      {statusMsg && (
        <div style={{ padding: '10px 15px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-main)' }}>
          {statusMsg}
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Thư viện Tài liệu</h3>
          <label className="primary-btn" style={{ cursor: 'pointer', padding: '5px 10px', fontSize: '13px' }}>
            {isUploading ? 'Đang tải...' : 'Upload Files (.md, .pdf)'}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleUpload} 
              style={{ display: 'none' }} 
              accept=".md,.pdf,.docx,.txt" 
              multiple 
              disabled={isUploading} 
            />
          </label>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isLoadingDocs ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Đang tải danh sách...</p>
          ) : docs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
              Chưa có tài liệu nào trong thư mục dao-tao. Hãy upload tài liệu để bắt đầu.
            </p>
          ) : (
            docs.map(doc => (
              <div key={doc._id} style={{ padding: '10px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>📄 {doc.name}</span>
                {doc.size && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {(doc.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
