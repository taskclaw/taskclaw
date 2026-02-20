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
} from 'lucide-react';
import { FileDropZone, type DroppedFile } from '@/components/ui/file-drop-zone';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';

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
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removeAttTarget, setRemoveAttTarget] = useState<string | null>(null);
  const [removeAttLoading, setRemoveAttLoading] = useState(false);

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
  }

  function cancelEdit() {
    setEditingDoc(null);
    setIsCreating(false);
    setFormData({ title: '', content: '', category_id: '', is_master: false });
    setAttachments([]);
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
        await updateKnowledgeDoc(editingDoc.id, data);
      } else {
        await createKnowledgeDoc(data);
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
    if (!editingDoc) return;
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
  }

  async function confirmRemoveAttachment() {
    if (!editingDoc || !removeAttTarget) return;
    setRemoveAttLoading(true);
    try {
      const updatedDoc = await removeAttachment(editingDoc.id, removeAttTarget);
      setAttachments(updatedDoc.file_attachments || []);
      setDocs((prev) =>
        prev.map((d) => (d.id === editingDoc.id ? { ...d, file_attachments: updatedDoc.file_attachments } : d)),
      );
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

  const filteredDocs = selectedCategory
    ? docs.filter((doc) => doc.category_id === selectedCategory)
    : docs;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar: Category Filter */}
      <div className="w-64 border-r bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Categories</h2>
        <button
          onClick={() => setSelectedCategory(null)}
          className={`w-full text-left px-3 py-2 rounded-md mb-1 ${
            selectedCategory === null
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
        >
          All Documents
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center gap-2 ${
              selectedCategory === cat.id
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Base</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create persistent context for AI conversations
            </p>
          </div>
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No documents yet. Create your first knowledge doc!</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredDocs.map((doc) => {
                const category = categories.find((c) => c.id === doc.category_id);
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      'border rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800',
                      deletingId === doc.id && 'animate-deleting',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {doc.is_master && (
                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                          )}
                          <h3 className="text-lg font-semibold">{doc.title}</h3>
                          {category && (
                            <span
                              className="px-2 py-1 text-xs rounded-full"
                              style={{
                                backgroundColor: `${category.color}20`,
                                color: category.color,
                              }}
                            >
                              {category.name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                          {doc.content.substring(0, 150)}...
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-xs text-gray-500">
                            Updated {new Date(doc.updated_at).toLocaleDateString()}
                          </p>
                          {doc.file_attachments?.length > 0 && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              {doc.file_attachments.length} file{doc.file_attachments.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {!doc.is_master && doc.category_id && (
                          <button
                            onClick={() => handleSetMaster(doc.id)}
                            className="p-2 text-gray-500 hover:text-yellow-500"
                            title="Set as master doc"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(doc)}
                          className="p-2 text-gray-500 hover:text-blue-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(doc.id)}
                          className="p-2 text-gray-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {(editingDoc || isCreating) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {editingDoc ? 'Edit Document' : 'New Document'}
              </h2>
              <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                <label className="block text-sm font-medium mb-1">Category</label>
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

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium">Content (Markdown)</label>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {showPreview ? 'Show Editor' : 'Show Preview'}
                  </button>
                </div>
                {showPreview ? (
                  <div className="border rounded-md p-4 min-h-[300px] prose dark:prose-invert max-w-none">
                    {formData.content || 'No content yet...'}
                  </div>
                ) : (
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 font-mono text-sm"
                    rows={15}
                    placeholder="Write your knowledge doc in Markdown..."
                  />
                )}
              </div>
            </div>

            {/* Attachments Section (only shown when editing an existing doc) */}
            {editingDoc && (
              <div className="border-t px-4 py-4">
                <label className="text-sm font-medium flex items-center gap-2 mb-2">
                  <Paperclip className="w-4 h-4" />
                  Attachments
                </label>
                <FileDropZone
                  onFilesDropped={handleFilesDropped}
                  accept=".pdf,.txt,.md,.doc,.docx,.csv,.json,.png,.jpg,.jpeg"
                  disabled={uploadingFiles.size > 0}
                />
                {(attachments.length > 0 || uploadingFiles.size > 0) && (
                  <div className="mt-2 space-y-1">
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
    </div>
  );
}
