'use client';

import { useState, useEffect } from 'react';
import {
  getKnowledgeDocs,
  getCategories,
  createKnowledgeDoc,
  updateKnowledgeDoc,
  setAsMasterDoc,
  deleteKnowledgeDoc,
  uploadAttachment,
  removeAttachment,
  getAttachmentContent,
} from './actions';
import {
  Star,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  FileText,
  Paperclip,
  File,
  Download,
  PenLine,
  FolderUp,
  BookOpen,
  Search,
} from 'lucide-react';
import { FileDropZone, type DroppedFile } from '@/components/ui/file-drop-zone';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ViewToggle } from '@/components/view-toggle';
import { PageLayout, PageHeader, PageFilterBar, PageSidebar, PageContent } from '@/components/page-layout';
import { BoardIcon } from '@/lib/board-icon';

interface FileAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
  uploaded_at: string;
}

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category_id: string | null;
  is_master: boolean;
  file_attachments: FileAttachment[];
  created_at: string;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDoc | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category_id: '',
    is_master: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'import'>('write');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removeAttTarget, setRemoveAttTarget] = useState<string | null>(null);
  const [removeAttLoading, setRemoveAttLoading] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [search, setSearch] = useState('');

  // File editor sidebar state
  const [activeFile, setActiveFile] = useState<string>('__DOC_CONTENT__');
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [pendingFiles, setPendingFiles] = useState<DroppedFile[]>([]);

  const TEXT_EXTENSIONS = new Set([
    'md', 'txt', 'csv', 'json', 'xml', 'yaml', 'yml',
    'js', 'ts', 'py', 'sh', 'html', 'css', 'sql',
    'toml', 'ini', 'cfg', 'conf', 'env', 'log',
  ]);

  function isTextFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return TEXT_EXTENSIONS.has(ext);
  }

  function resetFileEditor() {
    setActiveFile('__DOC_CONTENT__');
    setFileContents(new Map());
    setModifiedFiles(new Set());
    setLoadingFiles(new Set());
    setPendingFiles([]);
  }

  async function handleSelectFile(filename: string) {
    if (filename === '__DOC_CONTENT__') {
      setActiveFile(filename);
      return;
    }
    // Already cached
    if (fileContents.has(filename)) {
      setActiveFile(filename);
      return;
    }
    // For new docs, load from pendingFiles
    if (!editingDoc) {
      const pending = pendingFiles.find((f) => f.path === filename || f.name === filename);
      if (pending) {
        setFileContents((prev) => new Map(prev).set(filename, pending.content));
        setActiveFile(filename);
      }
      return;
    }
    // Fetch from backend
    setLoadingFiles((prev) => new Set(prev).add(filename));
    try {
      const result = await getAttachmentContent(editingDoc.id, filename);
      setFileContents((prev) => new Map(prev).set(filename, result.content));
      setActiveFile(filename);
    } catch (error: any) {
      toast.error(`Failed to load ${filename}: ${error.message}`);
    } finally {
      setLoadingFiles((prev) => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    }
  }

  function handleEditorChange(value: string) {
    if (activeFile === '__DOC_CONTENT__') {
      setFormData((prev) => ({ ...prev, content: value }));
    } else {
      setFileContents((prev) => new Map(prev).set(activeFile, value));
      setModifiedFiles((prev) => new Set(prev).add(activeFile));
    }
  }

  const currentEditorContent =
    activeFile === '__DOC_CONTENT__'
      ? formData.content
      : fileContents.get(activeFile) || '';

  const sidebarFiles = editingDoc
    ? attachments
    : pendingFiles.map((f) => ({
        name: f.path || f.name,
        size: f.file.size,
        type: f.file.type,
        url: '',
        uploaded_at: '',
      }));

  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  async function loadData() {
    try {
      setLoading(true);
      const [docsData, categoriesData] = await Promise.all([
        getKnowledgeDocs(selectedCategory || undefined),
        getCategories(),
      ]);
      setDocs(docsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setFormData({
      title: '',
      content: '',
      category_id: selectedCategory || '',
      is_master: false,
    });
    setIsCreating(true);
    setEditingDoc(null);
    setAttachments([]);
    setShowPreview(false);
    setActiveTab('write');
    resetFileEditor();
  }

  function startEdit(doc: KnowledgeDoc) {
    setFormData({
      title: doc.title,
      content: doc.content,
      category_id: doc.category_id || '',
      is_master: doc.is_master,
    });
    setAttachments(doc.file_attachments || []);
    setEditingDoc(doc);
    setIsCreating(false);
    setShowPreview(false);
    setActiveTab('write');
    resetFileEditor();
  }

  function cancelEdit() {
    setEditingDoc(null);
    setIsCreating(false);
    setFormData({ title: '', content: '', category_id: '', is_master: false });
    setAttachments([]);
    resetFileEditor();
  }

  async function handleSave() {
    try {
      if (!formData.title.trim()) {
        toast.error('Title is required');
        return;
      }

      const data = {
        title: formData.title,
        content: formData.content,
        category_id: formData.category_id || undefined,
        is_master: formData.is_master,
      };

      if (editingDoc) {
        // Upload modified reference files first
        for (const filename of modifiedFiles) {
          const content = fileContents.get(filename);
          if (content === undefined) continue;
          try {
            const blob = new Blob([content], { type: 'text/plain' });
            const file = new window.File([blob], filename, { type: 'text/plain' });
            const fd = new FormData();
            fd.append('file', file, filename);
            await uploadAttachment(editingDoc.id, fd);
          } catch (err: any) {
            toast.error(`Failed to save ${filename}: ${err.message}`);
            return;
          }
        }
        await updateKnowledgeDoc(editingDoc.id, data);
      } else {
        // Create doc first, then upload pending files
        const newDoc = await createKnowledgeDoc(data);
        if (pendingFiles.length > 0 && newDoc?.id) {
          for (const droppedFile of pendingFiles) {
            try {
              const fd = new FormData();
              const fileKey = droppedFile.path || droppedFile.name;
              const modifiedContent = fileContents.get(fileKey);
              if (modifiedContent !== undefined) {
                const blob = new Blob([modifiedContent], { type: 'text/plain' });
                const file = new window.File([blob], fileKey, { type: 'text/plain' });
                fd.append('file', file, fileKey);
              } else {
                fd.append('file', droppedFile.file, fileKey);
              }
              await uploadAttachment(newDoc.id, fd);
            } catch (err: any) {
              console.error(`Failed to upload ${droppedFile.name}:`, err);
            }
          }
        }
      }

      await loadData();
      cancelEdit();
    } catch (error: any) {
      console.error('Error saving doc:', error);
      toast.error(error.message || 'Failed to save doc');
    }
  }

  async function handleSetMaster(id: string) {
    try {
      await setAsMasterDoc(id);
      await loadData();
    } catch (error: any) {
      console.error('Error setting master:', error);
      toast.error(error.message || 'Failed to set as master doc');
    }
  }

  async function confirmDeleteDoc() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteKnowledgeDoc(deleteTarget);
      setDeleteTarget(null);
      setDeletingId(deleteTarget);
      setTimeout(() => {
        setDocs((prev) => prev.filter((d) => d.id !== deleteTarget));
        setDeletingId(null);
        toast.success('Document deleted');
      }, 500);
    } catch (error: any) {
      console.error('Error deleting doc:', error);
      toast.error(error.message || 'Failed to delete doc');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleFilesDropped(files: DroppedFile[]) {
    if (editingDoc) {
      // Edit mode: upload immediately
      for (const droppedFile of files) {
        const name = droppedFile.name;
        setUploadingFiles((prev) => new Set(prev).add(name));
        try {
          const fd = new FormData();
          fd.append('file', droppedFile.file);
          const updatedDoc = await uploadAttachment(editingDoc.id, fd);
          setAttachments(updatedDoc.file_attachments || []);
          setDocs((prev) =>
            prev.map((d) => (d.id === editingDoc.id ? { ...d, file_attachments: updatedDoc.file_attachments } : d)),
          );
        } catch (error: any) {
          console.error(`Error uploading ${name}:`, error);
          toast.error(`Failed to upload ${name}: ${error.message}`);
        } finally {
          setUploadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        }
      }
    } else {
      // Create mode: queue files for upload after save
      setPendingFiles((prev) => {
        const existing = new Set(prev.map((f) => f.path || f.name));
        const newFiles = files.filter((f) => !existing.has(f.path || f.name));
        return [...prev, ...newFiles];
      });
    }
  }

  async function confirmRemoveAttachment() {
    if (!removeAttTarget) return;

    // Handle pending file removal (create mode)
    if (!editingDoc) {
      const filename = removeAttTarget;
      setPendingFiles((prev) => prev.filter((f) => (f.path || f.name) !== filename));
      // Clean up file editor caches
      if (activeFile === filename) setActiveFile('__DOC_CONTENT__');
      setFileContents((prev) => { const next = new Map(prev); next.delete(filename); return next; });
      setModifiedFiles((prev) => { const next = new Set(prev); next.delete(filename); return next; });
      setRemoveAttTarget(null);
      toast.success('File removed');
      return;
    }

    // Handle existing attachment removal (edit mode)
    setRemoveAttLoading(true);
    try {
      const updatedDoc = await removeAttachment(editingDoc.id, removeAttTarget);
      setAttachments(updatedDoc.file_attachments || []);
      setDocs((prev) =>
        prev.map((d) => (d.id === editingDoc.id ? { ...d, file_attachments: updatedDoc.file_attachments } : d)),
      );
      // Clean up file editor caches
      if (activeFile === removeAttTarget) setActiveFile('__DOC_CONTENT__');
      setFileContents((prev) => { const next = new Map(prev); next.delete(removeAttTarget); return next; });
      setModifiedFiles((prev) => { const next = new Set(prev); next.delete(removeAttTarget); return next; });
      setRemoveAttTarget(null);
      toast.success('Attachment removed');
    } catch (error: any) {
      console.error('Error removing attachment:', error);
      toast.error(error.message || 'Failed to remove attachment');
    } finally {
      setRemoveAttLoading(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const filteredDocs = docs
    .filter((doc) => !selectedCategory || doc.category_id === selectedCategory)
    .filter((doc) => !search.trim() || doc.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
    <PageLayout
      header={
        <PageHeader
          icon={<BookOpen className="w-4 h-4 text-primary" />}
          title="Knowledge Base"
          meta={
            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-accent rounded-full">
              {docs.length}
            </span>
          }
          actions={
            <Button size="sm" onClick={startCreate}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Document
            </Button>
          }
        />
      }
      filterBar={
        <PageFilterBar
          left={
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents..."
                className="pl-8 h-8 w-56 text-sm"
              />
            </div>
          }
          right={<ViewToggle mode={view} onChange={setView} />}
        />
      }
      sidebar={
        <PageSidebar>
          <div className="px-3 pt-4 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 mb-1">Agents</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                selectedCategory === null
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span>All Documents</span>
              <span className="text-[10px]">{docs.length}</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors',
                  selectedCategory === cat.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="truncate">{cat.name}</span>
                </span>
                <span className="text-[10px] shrink-0">{docs.filter((d) => d.category_id === cat.id).length}</span>
              </button>
            ))}
          </div>
        </PageSidebar>
      }
    >
      <PageContent className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading...</div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <FileText className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">{search ? 'No documents match your search' : 'No documents yet'}</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDocs.map((doc) => {
              const category = categories.find((c) => c.id === doc.category_id);
              return (
                <div
                  key={doc.id}
                  className={cn(
                    'border border-border rounded-xl p-4 bg-card hover:bg-accent/30 transition-colors flex flex-col gap-2',
                    deletingId === doc.id && 'animate-deleting',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {doc.is_master && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                      <p className="text-sm font-semibold truncate">{doc.title}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!doc.is_master && doc.category_id && (
                        <button onClick={() => handleSetMaster(doc.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-amber-400 transition-colors" title="Set as master">
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => startEdit(doc)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(doc.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {category && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full w-fit font-medium" style={{ backgroundColor: `${category.color}20`, color: category.color }}>
                      {category.name}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{doc.content.substring(0, 120)}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60 pt-1 border-t border-border/50">
                    <span>Updated {new Date(doc.updated_at).toLocaleDateString()}</span>
                    {doc.file_attachments?.length > 0 && (
                      <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{doc.file_attachments.length}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b border-border">
              <p className="flex-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Document</p>
              <p className="hidden md:block w-32 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Agent</p>
              <p className="hidden lg:block w-28 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Updated</p>
              <div className="w-20" />
            </div>
            {filteredDocs.map((doc) => {
              const category = categories.find((c) => c.id === doc.category_id);
              return (
                <div
                  key={doc.id}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors',
                    deletingId === doc.id && 'animate-deleting',
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {doc.is_master && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    {doc.file_attachments?.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <Paperclip className="w-3 h-3" />{doc.file_attachments.length}
                      </span>
                    )}
                  </div>
                  {category && (
                    <span className="hidden md:block text-[10px] px-2 py-0.5 rounded-full w-32 text-center font-medium truncate" style={{ backgroundColor: `${category.color}20`, color: category.color }}>
                      {category.name}
                    </span>
                  )}
                  {!category && <div className="hidden md:block w-32" />}
                  <p className="hidden lg:block text-[11px] text-muted-foreground w-28 shrink-0">
                    {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-0.5 shrink-0 w-20 justify-end">
                    {!doc.is_master && doc.category_id && (
                      <button onClick={() => handleSetMaster(doc.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-amber-400 transition-colors" title="Set as master">
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => startEdit(doc)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(doc.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageContent>
    </PageLayout>
    <>
      {/* Editor Modal */}
      {(editingDoc || isCreating) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {editingDoc ? 'Edit Document' : 'New Document'}
              </h2>
              <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Metadata Fields */}
            <div className="px-4 pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Document title..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Agent</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_master"
                  checked={formData.is_master}
                  onChange={(e) => setFormData({ ...formData, is_master: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_master" className="text-sm font-medium">
                  Set as Master Document (auto-loaded for category tasks)
                </label>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b px-4">
              <button
                onClick={() => setActiveTab('write')}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                  activeTab === 'write'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                <PenLine className="w-4 h-4" />
                Write
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                  activeTab === 'import'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                <FolderUp className="w-4 h-4" />
                Import
                {(attachments.length > 0 || pendingFiles.length > 0) && (
                  <span className="text-xs bg-gray-200 dark:bg-gray-600 rounded-full px-1.5 py-0.5">
                    {attachments.length + pendingFiles.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {activeTab === 'write' ? (
                <div className="p-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium">
                      Content
                      {activeFile !== '__DOC_CONTENT__' && (
                        <span className="text-gray-400 font-normal ml-2">— {activeFile}</span>
                      )}
                    </label>
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {showPreview ? 'Show Editor' : 'Show Preview'}
                    </button>
                  </div>
                  <div className="flex gap-0 border rounded-md overflow-hidden" style={{ height: '400px' }}>
                    {/* File Sidebar */}
                    {sidebarFiles.length > 0 && (
                      <div className="w-48 flex-shrink-0 border-r bg-gray-50 dark:bg-gray-900 overflow-y-auto">
                        {/* Main Document Content button */}
                        <button
                          onClick={() => handleSelectFile('__DOC_CONTENT__')}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                            activeFile === '__DOC_CONTENT__' && 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 border-r-2 border-blue-600',
                          )}
                        >
                          <PenLine className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">Document Content</span>
                        </button>

                        {/* Reference Files Section */}
                        <div className="px-3 py-1.5">
                          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                            Reference Files
                          </p>
                        </div>

                        {sidebarFiles.map((att) => {
                          const editable = isTextFile(att.name);
                          const isActive = activeFile === att.name;
                          const isLoading = loadingFiles.has(att.name);
                          const isModified = modifiedFiles.has(att.name);

                          return (
                            <button
                              key={att.name}
                              onClick={() => editable && handleSelectFile(att.name)}
                              disabled={!editable || isLoading}
                              className={cn(
                                'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                                editable
                                  ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                                  : 'opacity-50 cursor-not-allowed',
                                isActive && 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 border-r-2 border-blue-600',
                              )}
                              title={editable ? att.name : `${att.name} (binary, not editable)`}
                            >
                              {isLoading ? (
                                <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                              )}
                              <span className="truncate">{att.name}</span>
                              {isModified && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 ml-auto" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Editor / Preview */}
                    {showPreview ? (
                      <div className="flex-1 px-3 py-2 overflow-y-auto prose dark:prose-invert max-w-none min-w-0">
                        {currentEditorContent || 'No content yet...'}
                      </div>
                    ) : (
                      <textarea
                        value={currentEditorContent}
                        onChange={(e) => handleEditorChange(e.target.value)}
                        className="flex-1 px-3 py-2 dark:bg-gray-700 font-mono text-sm resize-none focus:outline-none min-w-0"
                        placeholder={activeFile === '__DOC_CONTENT__' ? 'Write your knowledge doc in Markdown...' : `Edit ${activeFile}...`}
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* Import Tab */
                <div className="p-4 space-y-3">
                  <FileDropZone
                    onFilesDropped={handleFilesDropped}
                    accept=".pdf,.txt,.md,.doc,.docx,.csv,.json,.png,.jpg,.jpeg"
                    disabled={uploadingFiles.size > 0}
                  />
                  {(attachments.length > 0 || pendingFiles.length > 0 || uploadingFiles.size > 0) && (
                    <div className="space-y-1">
                      {/* Existing attachments (edit mode) */}
                      {attachments.map((att) => (
                        <div
                          key={att.name}
                          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-gray-50 dark:bg-gray-700/50 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{att.name}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {formatFileSize(att.size)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-gray-400 hover:text-blue-500"
                              title="Download"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => setRemoveAttTarget(att.name)}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {/* Pending files (create mode) */}
                      {pendingFiles.map((f) => {
                        const fileKey = f.path || f.name;
                        return (
                          <div
                            key={fileKey}
                            className="flex items-center justify-between px-3 py-1.5 rounded-md bg-gray-50 dark:bg-gray-700/50 text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{fileKey}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {formatFileSize(f.file.size)}
                              </span>
                            </div>
                            <button
                              onClick={() => setRemoveAttTarget(fileKey)}
                              className="p-1 text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {/* Uploading files spinner */}
                      {[...uploadingFiles].map((name) => (
                        <div
                          key={name}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-400"
                        >
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          <span className="truncate">Uploading {name}...</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t p-4 flex justify-end gap-2">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={confirmDeleteDoc}
        title="Delete document?"
        description="This knowledge document will be permanently deleted."
        loading={deleteLoading}
      />

      <ConfirmDeleteDialog
        open={!!removeAttTarget}
        onOpenChange={(open) => { if (!open) setRemoveAttTarget(null) }}
        onConfirm={confirmRemoveAttachment}
        title="Remove attachment?"
        description={`Remove "${removeAttTarget || ''}" from this document?`}
        confirmLabel="Remove"
        loading={removeAttLoading}
      />
    </>
    </>
  );
}
