'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getSkills, createSkill, updateSkill, deleteSkill,
  getCategorySkillsMap, linkSkillToCategory, unlinkSkillFromCategory,
  uploadSkillAttachment, removeSkillAttachment, getAttachmentContent,
} from './actions';
import { getCategories } from '../categories/actions';
import { Plus, Edit, Trash2, Save, X, Power, PowerOff, Tag, Link2, FileText, Download, PenLine, FolderUp, Plug, BrainCircuit } from 'lucide-react';
import { FileDropZone, type DroppedFile } from '@/components/ui/file-drop-zone';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';

interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
  uploaded_at: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  is_active: boolean;
  skill_type?: string;
  account_id?: string | null;
  file_attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

interface CategoryLink {
  skillId: string;
  categoryIds: string[];
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [integrationSkills, setIntegrationSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [skillCategoryMap, setSkillCategoryMap] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<'my-skills' | 'integration-skills'>('my-skills');
  const [viewingIntegrationSkill, setViewingIntegrationSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [linkingSkillId, setLinkingSkillId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<DroppedFile[]>([]);
  const [activeTab, setActiveTab] = useState<'write' | 'import'>('write');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    instructions: '',
    is_active: true,
  });

  // File editor sidebar state
  const [activeFile, setActiveFile] = useState<string>('__SKILL_MD__');
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  const TEXT_EXTENSIONS = new Set([
    'md', 'txt', 'csv', 'json', 'xml', 'yaml', 'yml',
    'js', 'ts', 'py', 'sh', 'html', 'css', 'sql',
    'toml', 'ini', 'cfg', 'conf', 'env', 'log',
  ]);

  function isTextFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return TEXT_EXTENSIONS.has(ext);
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [skillsData, catsData, catSkillsMap, integrationSkillsData] = await Promise.all([
        getSkills(),
        getCategories(),
        getCategorySkillsMap(),
        getSkills(false, 'integration', true),
      ]);
      setSkills((skillsData || []).filter((s: Skill) => s.skill_type !== 'integration'));
      setIntegrationSkills(integrationSkillsData || []);
      setCategories(catsData || []);

      // Build skill -> categories map (reverse of category -> skills)
      const scMap = new Map<string, string[]>();
      for (const [catId, skills] of Object.entries(catSkillsMap || {})) {
        for (const skill of skills) {
          const existing = scMap.get(skill.id) || [];
          if (!existing.includes(catId)) {
            existing.push(catId);
          }
          scMap.set(skill.id, existing);
        }
      }
      setSkillCategoryMap(scMap);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function resetFileEditor() {
    setActiveFile('__SKILL_MD__');
    setFileContents(new Map());
    setModifiedFiles(new Set());
    setLoadingFiles(new Set());
  }

  function startCreate() {
    setFormData({
      name: '',
      description: '',
      instructions: '',
      is_active: true,
    });
    setAttachments([]);
    setPendingFiles([]);
    setActiveTab('write');
    resetFileEditor();
    setIsCreating(true);
    setEditingSkill(null);
  }

  function startEdit(skill: Skill) {
    setFormData({
      name: skill.name,
      description: skill.description || '',
      instructions: skill.instructions,
      is_active: skill.is_active,
    });
    setAttachments(skill.file_attachments || []);
    setPendingFiles([]);
    setActiveTab('write');
    resetFileEditor();
    setEditingSkill(skill);
    setIsCreating(false);
  }

  function cancelEdit() {
    setEditingSkill(null);
    setIsCreating(false);
    setAttachments([]);
    setPendingFiles([]);
    setActiveTab('write');
    resetFileEditor();
    setFormData({ name: '', description: '', instructions: '', is_active: true });
  }

  async function handleSelectFile(filename: string) {
    if (filename === '__SKILL_MD__') {
      setActiveFile(filename);
      return;
    }
    if (fileContents.has(filename)) {
      setActiveFile(filename);
      return;
    }
    // For new skills, load from pendingFiles
    if (!editingSkill) {
      const pending = pendingFiles.find((f) => f.path === filename);
      if (pending) {
        setFileContents((prev) => new Map(prev).set(filename, pending.content));
        setActiveFile(filename);
      }
      return;
    }
    // Fetch from backend
    setLoadingFiles((prev) => new Set(prev).add(filename));
    try {
      const result = await getAttachmentContent(editingSkill.id, filename);
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
    if (activeFile === '__SKILL_MD__') {
      setFormData((prev) => ({ ...prev, instructions: value }));
    } else {
      setFileContents((prev) => new Map(prev).set(activeFile, value));
      setModifiedFiles((prev) => new Set(prev).add(activeFile));
    }
  }

  const currentEditorContent = activeFile === '__SKILL_MD__'
    ? formData.instructions
    : (fileContents.get(activeFile) ?? '');

  // Files for the sidebar (attachments for existing, pendingFiles for new)
  const sidebarFiles = editingSkill
    ? attachments
    : pendingFiles.map((f) => ({ name: f.path, size: f.file.size, type: f.file.type, url: '', uploaded_at: '' }));

  async function handleSave() {
    try {
      if (!formData.name.trim()) {
        toast.error('Name is required');
        return;
      }
      if (!formData.instructions.trim()) {
        toast.error('Instructions are required');
        return;
      }

      const data = {
        name: formData.name,
        description: formData.description,
        instructions: formData.instructions,
        is_active: formData.is_active,
      };

      if (editingSkill) {
        // Upload modified reference files first
        for (const filename of modifiedFiles) {
          const content = fileContents.get(filename);
          if (content === undefined) continue;
          try {
            const blob = new Blob([content], { type: 'text/plain' });
            const file = new File([blob], filename, { type: 'text/plain' });
            const fd = new FormData();
            fd.append('file', file, filename);
            await uploadSkillAttachment(editingSkill.id, fd);
          } catch (err: any) {
            toast.error(`Failed to save ${filename}: ${err.message}`);
            return;
          }
        }
        await updateSkill(editingSkill.id, data);
      } else {
        const newSkill = await createSkill(data);
        // Upload any pending reference files for the new skill
        if (pendingFiles.length > 0 && newSkill?.id) {
          for (const droppedFile of pendingFiles) {
            try {
              const fd = new FormData();
              // Check if this file was edited in the Write tab
              const modifiedContent = fileContents.get(droppedFile.path);
              if (modifiedContent !== undefined) {
                const blob = new Blob([modifiedContent], { type: 'text/plain' });
                const file = new File([blob], droppedFile.path, { type: 'text/plain' });
                fd.append('file', file, droppedFile.path);
              } else {
                fd.append('file', droppedFile.file, droppedFile.path);
              }
              await uploadSkillAttachment(newSkill.id, fd);
            } catch (err: any) {
              console.error(`Failed to upload ${droppedFile.path}:`, err);
            }
          }
        }
      }

      await loadData();
      cancelEdit();
    } catch (error: any) {
      console.error('Error saving skill:', error);
      toast.error(error.message || 'Failed to save skill');
    }
  }

  async function handleToggleActive(skill: Skill) {
    try {
      await updateSkill(skill.id, { is_active: !skill.is_active });
      await loadData();
    } catch (error: any) {
      console.error('Error toggling skill:', error);
      toast.error(error.message || 'Failed to toggle skill');
    }
  }

  async function confirmDeleteSkill() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteSkill(deleteTarget.id);
      setDeleteTarget(null);
      setDeletingId(deleteTarget.id);
      setTimeout(() => {
        setSkills((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        setDeletingId(null);
        toast.success('Skill deleted');
      }, 500);
    } catch (error: any) {
      console.error('Error deleting skill:', error);
      toast.error(error.message || 'Failed to delete skill');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLinkCategory(skillId: string, categoryId: string) {
    try {
      await linkSkillToCategory(skillId, categoryId);
      setLinkingSkillId(null);
      await loadData();
    } catch (error: any) {
      console.error('Error linking category:', error);
      toast.error(error.message || 'Failed to link category');
    }
  }

  async function handleUnlinkCategory(skillId: string, categoryId: string) {
    try {
      await unlinkSkillFromCategory(skillId, categoryId);
      await loadData();
    } catch (error: any) {
      console.error('Error unlinking category:', error);
      toast.error(error.message || 'Failed to unlink category');
    }
  }

  async function handleFilesDropped(files: DroppedFile[]) {
    if (editingSkill) {
      // Editing: upload immediately
      for (const droppedFile of files) {
        const displayPath = droppedFile.path;
        setUploadingFiles((prev) => new Set(prev).add(displayPath));
        try {
          const fd = new FormData();
          // Use path as filename to preserve folder structure (e.g. "references/guide.md")
          fd.append('file', droppedFile.file, droppedFile.path);
          const updated = await uploadSkillAttachment(editingSkill.id, fd);
          setAttachments(updated.file_attachments || []);
        } catch (error: any) {
          console.error(`Error uploading ${displayPath}:`, error);
          toast.error(`Failed to upload ${displayPath}: ${error.message}`);
        } finally {
          setUploadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(displayPath);
            return next;
          });
        }
      }
    } else {
      // Creating: queue files for upload after save
      setPendingFiles((prev) => {
        const existing = new Set(prev.map((f) => f.path));
        const newFiles = files.filter((f) => !existing.has(f.path));
        return [...prev, ...newFiles];
      });
    }
  }

  async function handleRemoveAttachment(filename: string) {
    if (editingSkill) {
      try {
        const updated = await removeSkillAttachment(editingSkill.id, filename);
        setAttachments(updated.file_attachments || []);
      } catch (error: any) {
        console.error('Error removing attachment:', error);
        toast.error(error.message || 'Failed to remove attachment');
      }
    } else {
      // Remove from pending queue (match by path to support folder structure)
      setPendingFiles((prev) => prev.filter((f) => f.path !== filename));
    }
    // Clean up file editor caches
    if (activeFile === filename) setActiveFile('__SKILL_MD__');
    setFileContents((prev) => { const n = new Map(prev); n.delete(filename); return n; });
    setModifiedFiles((prev) => { const n = new Set(prev); n.delete(filename); return n; });
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  const getCategoryById = (id: string) => categories.find((c) => c.id === id);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-3xl font-bold">Skills Management</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create custom AI behaviors with instruction sets. Link skills to agents for automatic provider sync.
            </p>
          </div>
          {pageTab === 'my-skills' && (
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Skill
            </button>
          )}
        </div>

        {/* Page Tabs */}
        <div className="flex border-b mt-4">
          <button
            onClick={() => setPageTab('my-skills')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              pageTab === 'my-skills'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            My Skills
            {skills.length > 0 && (
              <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                {skills.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setPageTab('integration-skills')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              pageTab === 'integration-skills'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Plug className="w-4 h-4" />
            Integration Skills
            {integrationSkills.length > 0 && (
              <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                {integrationSkills.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Integration Skills Tab */}
      {pageTab === 'integration-skills' && (
        <>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : integrationSkills.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Plug className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No integration skills found.</p>
              <p className="text-xs mt-1">Connect integrations from the Marketplace to see their skills here.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {integrationSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="border rounded-lg p-4 bg-white dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Plug className="w-4 h-4 text-blue-500" />
                        <h3 className="text-lg font-semibold">{skill.name}</h3>
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                          Integration
                        </span>
                        {!skill.account_id && (
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                            System
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {skill.description}
                        </p>
                      )}
                      <details className="text-sm text-gray-700 dark:text-gray-300">
                        <summary className="cursor-pointer text-blue-600 hover:underline">
                          View Instructions ({skill.instructions?.length || 0} chars)
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-md overflow-x-auto whitespace-pre-wrap text-xs max-h-96 overflow-y-auto">
                          {skill.instructions}
                        </pre>
                      </details>
                      <p className="text-xs text-gray-500 mt-2">
                        Updated {new Date(skill.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* My Skills Tab */}
      {pageTab === 'my-skills' && (
        <>
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No skills yet. Create your first AI skill!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {skills.map((skill) => {
            const linkedCategoryIds = skillCategoryMap.get(skill.id) || [];
            const unlinkedCategories = categories.filter(
              (c) => !linkedCategoryIds.includes(c.id),
            );

            return (
              <div
                key={skill.id}
                className={cn(
                  'border rounded-lg p-4',
                  skill.is_active
                    ? 'bg-white dark:bg-gray-800'
                    : 'bg-gray-50 dark:bg-gray-900 opacity-60',
                  deletingId === skill.id && 'animate-deleting',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{skill.name}</h3>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          skill.is_active
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {skill.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {skill.description}
                      </p>
                    )}

                    {/* Linked Categories */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Tag className="h-3.5 w-3.5 text-gray-400" />
                      {linkedCategoryIds.length > 0 ? (
                        linkedCategoryIds.map((catId) => {
                          const cat = getCategoryById(catId);
                          if (!cat) return null;
                          return (
                            <span
                              key={catId}
                              className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 border"
                              style={{
                                backgroundColor: `${cat.color || '#71717a'}15`,
                                borderColor: `${cat.color || '#71717a'}40`,
                                color: cat.color || '#71717a',
                              }}
                            >
                              {cat.icon && <span>{cat.icon}</span>}
                              {cat.name}
                              <button
                                onClick={() => handleUnlinkCategory(skill.id, catId)}
                                className="ml-0.5 hover:opacity-70"
                                title={`Unlink from ${cat.name}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-xs text-gray-400">No agents linked</span>
                      )}
                      <button
                        onClick={() => setLinkingSkillId(linkingSkillId === skill.id ? null : skill.id)}
                        className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Link2 className="h-3 w-3" />
                        Link
                      </button>
                    </div>

                    {/* Category linking dropdown */}
                    {linkingSkillId === skill.id && (
                      <div className="mb-3 p-2 rounded-lg border bg-gray-50 dark:bg-gray-800 space-y-1">
                        {unlinkedCategories.length > 0 ? (
                          <>
                            <p className="text-xs text-gray-500 mb-1">Link to agent:</p>
                            {unlinkedCategories.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => handleLinkCategory(skill.id, cat.id)}
                                className="flex items-center gap-2 w-full text-left text-xs rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: cat.color || '#71717a' }}
                                />
                                {cat.icon && <span>{cat.icon}</span>}
                                <span>{cat.name}</span>
                              </button>
                            ))}
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">
                            Already linked to all agents.
                          </p>
                        )}
                      </div>
                    )}

                    <details className="text-sm text-gray-700 dark:text-gray-300">
                      <summary className="cursor-pointer text-blue-600 hover:underline">
                        View Instructions
                        {(skill.file_attachments?.length || 0) > 0 && (
                          <span className="ml-2 text-xs text-gray-400">
                            + {skill.file_attachments!.length} reference file{skill.file_attachments!.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-md overflow-x-auto whitespace-pre-wrap">
                        {skill.instructions}
                      </pre>
                    </details>
                    <p className="text-xs text-gray-500 mt-2">
                      Updated {new Date(skill.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleToggleActive(skill)}
                      className={`p-2 ${
                        skill.is_active
                          ? 'text-green-600 hover:text-green-700'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      title={skill.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {skill.is_active ? (
                        <Power className="w-4 h-4" />
                      ) : (
                        <PowerOff className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(skill)}
                      className="p-2 text-gray-500 hover:text-blue-600"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: skill.id, name: skill.name })}
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

      {/* Editor Modal */}
      {(editingSkill || isCreating) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="border-b p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">
                {editingSkill ? 'Edit Skill' : 'New Skill'}
              </h2>
              <button onClick={cancelEdit} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Name & Description — always visible */}
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  placeholder="e.g., Code Review Expert"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Brief description (optional)"
                />
              </div>

              {/* Tabs */}
              <div>
                <div className="flex border-b">
                  <button
                    onClick={() => setActiveTab('write')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'write'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <PenLine className="w-4 h-4" />
                    Write
                  </button>
                  <button
                    onClick={() => setActiveTab('import')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'import'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <FolderUp className="w-4 h-4" />
                    Import
                  </button>
                </div>

                {/* Write Tab */}
                {activeTab === 'write' && (
                  <div className="pt-4">
                    <label className="block text-sm font-medium mb-1">
                      {activeFile === '__SKILL_MD__' ? 'Instructions *' : activeFile}
                      {activeFile !== '__SKILL_MD__' && modifiedFiles.has(activeFile) && (
                        <span className="ml-2 text-xs text-amber-500">(modified)</span>
                      )}
                    </label>

                    <div className="flex gap-0 border rounded-md overflow-hidden" style={{ height: '400px' }}>
                      {/* File Sidebar */}
                      {sidebarFiles.length > 0 && (
                        <div className="w-48 flex-shrink-0 border-r bg-gray-50 dark:bg-gray-900 overflow-y-auto">
                          <button
                            onClick={() => handleSelectFile('__SKILL_MD__')}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                              activeFile === '__SKILL_MD__' && 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 border-r-2 border-blue-600',
                            )}
                          >
                            <PenLine className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">SKILL.md</span>
                          </button>

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

                      {/* Editor */}
                      <textarea
                        value={currentEditorContent}
                        onChange={(e) => handleEditorChange(e.target.value)}
                        className="flex-1 px-3 py-2 dark:bg-gray-700 font-mono text-sm resize-none focus:outline-none min-w-0"
                        placeholder={
                          activeFile === '__SKILL_MD__'
                            ? 'When reviewing code, check for:\n1. Security vulnerabilities\n2. Performance bottlenecks\n3. Clean code principles...'
                            : `Edit ${activeFile}...`
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Import Tab */}
                {activeTab === 'import' && (
                  <div className="pt-4 space-y-3">
                    <FileDropZone
                      onFilesDropped={handleFilesDropped}
                      onMainContent={(content) => setFormData((prev) => ({ ...prev, instructions: content }))}
                      mainFileName="SKILL.md"
                      disabled={uploadingFiles.size > 0}
                      className="py-10"
                    />

                    {formData.instructions && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
                        <PenLine className="w-4 h-4 flex-shrink-0" />
                        Instructions loaded ({formData.instructions.length} chars)
                      </div>
                    )}

                    {/* Uploaded attachments (editing existing skill) */}
                    {(attachments.length > 0 || uploadingFiles.size > 0) && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Uploaded Files</p>
                        <div className="space-y-1">
                          {attachments.map((att) => (
                            <div
                              key={att.name}
                              className="flex items-center justify-between px-3 py-1.5 rounded-md bg-gray-50 dark:bg-gray-700/50 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
                                  onClick={() => handleRemoveAttachment(att.name)}
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
                      </div>
                    )}

                    {/* Pending files (creating new skill) */}
                    {pendingFiles.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          Queued Files (will upload on save)
                        </p>
                        <div className="space-y-1">
                          {pendingFiles.map((f) => (
                            <div
                              key={f.path}
                              className="flex items-center justify-between px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                <span className="truncate">{f.path}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  {formatFileSize(f.file.size)}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveAttachment(f.path)}
                                className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-400">
                      Drop a skill folder — SKILL.md fills instructions, other files become references.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_active" className="text-sm font-medium">
                  Active (visible in skill selector)
                </label>
              </div>
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
        onConfirm={confirmDeleteSkill}
        title="Delete skill?"
        description={`This will permanently delete "${deleteTarget?.name || ''}" and its reference files.`}
        loading={deleteLoading}
      />
        </>
      )}
    </div>
  );
}
