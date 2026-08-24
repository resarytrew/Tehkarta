import { extractText, getDocumentProxy } from 'unpdf';
import { ApplicationError } from '@tehkarta/application';

export function normalizedDocumentMimeType(mimeType: string, filename: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === 'application/pdf' || normalized === 'text/plain' || normalized === 'text/markdown') return normalized;
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'md' || extension === 'markdown') return 'text/markdown';
  if (extension === 'txt') return 'text/plain';
  return normalized;
}

export async function extractDocumentText(bytes: Uint8Array, mimeType: string): Promise<{ text: string; pageCount?: number }> {
  if (mimeType === 'application/pdf') {
    try {
      const pdf = await getDocumentProxy(bytes);
      const extracted = await extractText(pdf, { mergePages: true });
      return { text: extracted.text, pageCount: extracted.totalPages };
    } catch {
      throw new ApplicationError('VALIDATION_FAILED', 'Не удалось прочитать PDF. Проверьте, что файл не повреждён и не защищён паролем.');
    }
  }
  return { text: Buffer.from(bytes).toString('utf8') };
}
