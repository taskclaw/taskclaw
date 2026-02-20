'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Upload, FolderOpen } from 'lucide-react';

export interface DroppedFile {
  name: string;
  path: string; // relative path within folder
  content: string; // text content for .md/.txt
  file: File;
}

interface FileDropZoneProps {
  onFilesDropped: (files: DroppedFile[]) => void;
  onMainContent?: (content: string) => void; // Called when mainFileName is found
  mainFileName?: string; // e.g. "SKILL.md"
  accept?: string;
  maxFileSize?: number;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}

/** Hidden/system files to always skip */
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep', 'desktop.ini']);

function isHiddenFile(name: string): boolean {
  return name.startsWith('.') || IGNORED_FILES.has(name);
}

/**
 * Recursively reads all files from a FileSystemDirectoryEntry.
 */
function readDirectoryRecursive(dirEntry: FileSystemDirectoryEntry, basePath: string): Promise<DroppedFile[]> {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const allFiles: DroppedFile[] = [];

    function readBatch() {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(allFiles);
          return;
        }

        for (const entry of entries) {
          if (isHiddenFile(entry.name)) continue;

          if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            const file = await new Promise<File>((res) => fileEntry.file(res));
            const content = await readFileAsText(file);
            const filePath = basePath ? `${basePath}/${file.name}` : file.name;
            allFiles.push({
              name: file.name,
              path: filePath,
              content,
              file,
            });
          } else if (entry.isDirectory) {
            const subPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            const subFiles = await readDirectoryRecursive(
              entry as FileSystemDirectoryEntry,
              subPath,
            );
            allFiles.push(...subFiles);
          }
        }

        // readEntries may return results in batches
        readBatch();
      });
    }

    readBatch();
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    // Only read text-based files
    const textTypes = [
      'text/', 'application/json', 'application/xml',
      'application/javascript', 'application/typescript',
    ];
    const isText = textTypes.some((t) => file.type.startsWith(t)) ||
      /\.(md|txt|csv|json|xml|yaml|yml|js|ts|py|sh|html|css|sql)$/i.test(file.name);

    if (!isText) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

export function FileDropZone({
  onFilesDropped,
  onMainContent,
  mainFileName,
  accept,
  maxFileSize = 10 * 1024 * 1024,
  disabled = false,
  children,
  className = '',
}: FileDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processEntries = useCallback(
    async (items: DataTransferItemList) => {
      setProcessing(true);
      try {
        const allFiles: DroppedFile[] = [];

        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (!entry) continue;

          if (isHiddenFile(entry.name)) continue;

          if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            const file = await new Promise<File>((res) => fileEntry.file(res));
            if (file.size > maxFileSize) continue;
            const content = await readFileAsText(file);
            allFiles.push({ name: file.name, path: file.name, content, file });
          } else if (entry.isDirectory) {
            // Pass '' as basePath to strip the top-level folder name
            // e.g. dropping "my-skill/" gives paths like "references/file.md"
            const dirFiles = await readDirectoryRecursive(
              entry as FileSystemDirectoryEntry,
              '',
            );
            allFiles.push(
              ...dirFiles.filter((f) => f.file.size <= maxFileSize),
            );
          }
        }

        // Separate main file if configured
        if (mainFileName && onMainContent) {
          const mainFile = allFiles.find(
            (f) => f.name.toLowerCase() === mainFileName.toLowerCase(),
          );
          if (mainFile) {
            onMainContent(mainFile.content);
            const remaining = allFiles.filter((f) => f !== mainFile);
            if (remaining.length > 0) {
              onFilesDropped(remaining);
            }
            return;
          }
        }

        if (allFiles.length > 0) {
          onFilesDropped(allFiles);
        }
      } finally {
        setProcessing(false);
      }
    },
    [onFilesDropped, onMainContent, mainFileName, maxFileSize],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragActive(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled || !e.dataTransfer.items.length) return;
      await processEntries(e.dataTransfer.items);
    },
    [disabled, processEntries],
  );

  const handleFileInput = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setProcessing(true);
      try {
        const allFiles: DroppedFile[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.size > maxFileSize) continue;
          if (isHiddenFile(file.name)) continue;

          const content = await readFileAsText(file);
          // webkitRelativePath is "folderName/sub/file.md" — strip the top-level folder
          const webkitPath = (file as any).webkitRelativePath as string | undefined;
          let relativePath = file.name;
          if (webkitPath) {
            const parts = webkitPath.split('/');
            // Remove first segment (top-level folder name)
            relativePath = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
          }

          allFiles.push({
            name: file.name,
            path: relativePath,
            content,
            file,
          });
        }

        if (mainFileName && onMainContent) {
          const mainFile = allFiles.find(
            (f) => f.name.toLowerCase() === mainFileName.toLowerCase(),
          );
          if (mainFile) {
            onMainContent(mainFile.content);
            const remaining = allFiles.filter((f) => f !== mainFile);
            if (remaining.length > 0) {
              onFilesDropped(remaining);
            }
            return;
          }
        }

        if (allFiles.length > 0) {
          onFilesDropped(allFiles);
        }
      } finally {
        setProcessing(false);
        // Reset input so same file can be selected again
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onFilesDropped, onMainContent, mainFileName, maxFileSize],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative rounded-lg border-2 border-dashed transition-colors
        ${isDragActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }
        ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        ${className}
      `}
      onClick={() => !disabled && !processing && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleFileInput}
        className="hidden"
        {...({ webkitdirectory: '' } as any)}
      />

      {children || (
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
          {processing ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Processing files...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                {isDragActive ? (
                  <Upload className="w-5 h-5 text-blue-500" />
                ) : (
                  <FolderOpen className="w-5 h-5 text-gray-400" />
                )}
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {isDragActive ? 'Drop here' : 'Drop folder or files here'}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                or click to browse
                {mainFileName && ` • ${mainFileName} auto-fills instructions`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
