'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getSkills, createSkill, updateSkill, deleteSkill,
  getCategorySkillsMap, linkSkillToCategory, unlinkSkillFromCategory,
  uploadSkillAttachment, removeSkillAttachment, getAttachmentContent,
} from './actions';
import { getCategories } from '../categories/actions';
import { Plus, Edit, Trash2, Save, X, Power, PowerOff, Link2, FileText, Download, PenLine, FolderUp, Plug, BrainCircuit, Search } from 'lucide-react';
import { FileDropZone, type DroppedFile } from '@/components/ui/file-drop-zone';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ViewToggle } from '@/components/view-toggle';
import { PageLayout, PageHeader, PageFilterBar, PageContent } from '@/components/page-layout';

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
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [search, setSearch] = useState('');
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

  const filteredSkills = search.trim()
    ? skills.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase()))
    : skills;

  const filteredIntegrationSkills = search.trim()
    ? integrationSkills.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase()))
    : integrationSkills;

  const activeList = pageTab === 'my-skills' ? filteredSkills : filteredIntegrationSkills;

  return (
    <>
      <PageLayout
        header={
          <PageHeader
            icon={<BrainCircuit className="w-4 h-4 text-primary" />}
            title="Skills"
            meta={
              <span className="text-xs text-muted-foreground px-2 py-0.5 bg-accent rounded-full">
                {pageTab === 'my-skills' ? skills.length : integrationSkills.length}
              </span>
            }
            actions={
              pageTab === 'my-skills' ? (
                <Button size="sm" onClick={startCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Skill
                </Button>
              ) : undefined
            }
          />
        }
        filterBar={
          <PageFilterBar
            left={
              <div className="flex items-center gap-3">
                {/* Tab switcher */}
                <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/40">
                  <button
                    onClick={() => setPageTab('my-skills')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                      pageTab === 'my-skills'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    My Skills
                    {skills.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{skills.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setPageTab('integration-skills')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                      pageTab === 'integration-skills'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Plug className="w-3.5 h-3.5" />
                    Integrations
                    {integrationSkills.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{integrationSkills.length}</span>
                    )}
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search skills..."
                    className="pl-8 h-8 w-52 text-sm"
                  />
                </div>
              </div>
            }
            right={<ViewToggle mode={view} onChange={setView} />}
          />
        }
      >
        <PageContent className="p-4 max-w-5xl mx-auto w-full">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Loading skills...
            </div>
          ) : activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              {pageTab === 'integration-skills' ? (
                <>
                  <Plug className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">No integration skills found</p>
                  <p className="text-xs mt-1 opacity-60">Connect integrations from the Marketplace</p>
                </>
              ) : (
                <>
                  <BrainCircuit className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">{search ? 'No skills match your search' : 'No skills yet'}</p>
                  {!search && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={startCreate}>
                      <Plus className="h-3 w-3 mr-1.5" />
                      Create your first skill
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : view === 'grid' ? (
            /* ── Grid view ── */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeList.map((skill) => {
                const linkedCategoryIds = skillCategoryMap.get(skill.id) || [];
                return (
                  <div
                    key={skill.id}
                    className={cn(
                      'group flex flex-col border border-border rounded-xl p-4 bg-card transition-all',
                      skill.is_active ? 'hover:bg-accent/30 hover:border-primary/30' : 'opacity-60',
                      deletingId === skill.id && 'animate-deleting',
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {pageTab === 'integration-skills'
                            ? <Plug className="w-3.5 h-3.5 text-primary" />
                            : <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{skill.name}</p>
                          {skill.description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{skill.description}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant={skill.is_active ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 shrink-0 ml-1">
                        {skill.is_active ? 'Active' : 'Off'}
                      </Badge>
                    </div>

                    {/* Linked agents */}
                    {pageTab === 'my-skills' && (
                      <div className="flex flex-wrap gap-1 mb-3 flex-1">
                        {linkedCategoryIds.length > 0 ? linkedCategoryIds.map((catId) => {
                          const cat = getCategoryById(catId);
                          if (!cat) return null;
                          return (
                            <span
                              key={catId}
                              className="text-[10px] px-2 py-0.5 rounded-full border"
                              style={{ backgroundColor: `${cat.color || '#71717a'}15`, borderColor: `${cat.color || '#71717a'}40`, color: cat.color || '#71717a' }}
                            >
                              {cat.name}
                            </span>
                          );
                        }) : (
                          <span className="text-[10px] text-muted-foreground/50">No agents linked</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(skill.updated_at).toLocaleDateString()}
                      </span>
                      {pageTab === 'my-skills' && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleToggleActive(skill)}
                            className={cn('p-1.5 rounded-md hover:bg-accent', skill.is_active ? 'text-green-500' : 'text-muted-foreground')}
                            title={skill.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {skill.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => startEdit(skill)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget({ id: skill.id, name: skill.name })} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── List view ── */
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b border-border">
                <p className="flex-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Skill</p>
                <p className="hidden md:block w-[180px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Agents</p>
                <p className="shrink-0 w-20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
                <p className="shrink-0 w-24 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Updated</p>
                {pageTab === 'my-skills' && <div className="shrink-0 w-20" />}
              </div>
              {activeList.map((skill) => {
                const linkedCategoryIds = skillCategoryMap.get(skill.id) || [];
                const unlinkedCategories = categories.filter((c) => !linkedCategoryIds.includes(c.id));
                return (
                  <div
                    key={skill.id}
                    className={cn(
                      'group flex items-center gap-4 px-4 py-3 border-b border-border last:border-0',
                      'hover:bg-accent/30 transition-colors relative',
                      !skill.is_active && 'opacity-60',
                      deletingId === skill.id && 'animate-deleting',
                    )}
                  >
                    {/* Name + desc */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {pageTab === 'integration-skills'
                          ? <Plug className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          : <BrainCircuit className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        }
                        <p className="text-sm font-medium truncate">{skill.name}</p>
                      </div>
                      {skill.description && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5 pl-5">{skill.description}</p>
                      )}
                    </div>

                    {/* Linked agents */}
                    {pageTab === 'my-skills' ? (
                      <div className="hidden md:flex flex-wrap gap-1 w-[180px] items-center">
                        {linkedCategoryIds.length > 0 ? linkedCategoryIds.slice(0, 2).map((catId) => {
                          const cat = getCategoryById(catId);
                          if (!cat) return null;
                          return (
                            <span
                              key={catId}
                              className="text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
                              style={{ backgroundColor: `${cat.color || '#71717a'}15`, borderColor: `${cat.color || '#71717a'}40`, color: cat.color || '#71717a' }}
                            >
                              {cat.name}
                              <button onClick={() => handleUnlinkCategory(skill.id, catId)} className="hover:opacity-70">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        }) : <span className="text-[10px] text-muted-foreground/50">None</span>}
                        {linkedCategoryIds.length > 2 && (
                          <span className="text-[10px] text-muted-foreground/60">+{linkedCategoryIds.length - 2}</span>
                        )}
                        <button
                          onClick={() => setLinkingSkillId(linkingSkillId === skill.id ? null : skill.id)}
                          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 border border-dashed border-border rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Link2 className="h-2.5 w-2.5" />
                        </button>
                        {/* Inline link dropdown */}
                        {linkingSkillId === skill.id && (
                          <div className="absolute z-10 top-full left-48 mt-1 w-44 rounded-lg border border-border bg-popover shadow-md p-1 space-y-0.5">
                            {unlinkedCategories.length > 0 ? unlinkedCategories.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => handleLinkCategory(skill.id, cat.id)}
                                className="flex items-center gap-2 w-full text-left text-xs rounded px-2 py-1.5 hover:bg-accent transition-colors"
                              >
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color || '#71717a' }} />
                                {cat.name}
                              </button>
                            )) : (
                              <p className="text-xs text-muted-foreground px-2 py-1.5">All linked</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="hidden md:flex w-[180px] gap-1">
                        <Badge variant="secondary" className="text-[9px]">Integration</Badge>
                        {!skill.account_id && <Badge variant="outline" className="text-[9px]">System</Badge>}
                      </div>
                    )}

                    {/* Status */}
                    <div className="shrink-0 w-20">
                      <Badge variant={skill.is_active ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0">
                        {skill.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {/* Updated */}
                    <span className="shrink-0 w-24 text-[11px] text-muted-foreground">
                      {new Date(skill.updated_at).toLocaleDateString()}
                    </span>

                    {/* Actions */}
                    {pageTab === 'my-skills' && (
                      <div className="shrink-0 w-20 flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggleActive(skill)}
                          className={cn('p-1.5 rounded-md hover:bg-accent', skill.is_active ? 'text-green-500' : 'text-muted-foreground')}
                          title={skill.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {skill.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => startEdit(skill)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget({ id: skill.id, name: skill.name })} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PageContent>
      </PageLayout>

      {/* Editor Modal */}
      {(editingSkill || isCreating) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-xl">
            {/* Modal Header */}
            <div className="border-b border-border px-5 py-4 flex justify-between items-center shrink-0">
              <h2 className="text-base font-semibold">
                {editingSkill ? 'Edit Skill' : 'New Skill'}
              </h2>
              <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
              <div>
                <label className="block text-sm font-medium mb-1.5">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Code Review Expert"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description (optional)"
                />
              </div>

              {/* Inner Tabs: Write / Import */}
              <div>
                <div className="flex gap-0.5 border-b border-border mb-4">
                  <button
                    onClick={() => setActiveTab('write')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                      activeTab === 'write' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    Write
                  </button>
                  <button
                    onClick={() => setActiveTab('import')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                      activeTab === 'import' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <FolderUp className="w-3.5 h-3.5" />
                    Import
                  </button>
                </div>

                {/* Write Tab */}
                {activeTab === 'write' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      {activeFile === '__SKILL_MD__' ? 'Instructions *' : activeFile}
                      {activeFile !== '__SKILL_MD__' && modifiedFiles.has(activeFile) && (
                        <span className="ml-2 text-xs text-amber-500">(modified)</span>
                      )}
                    </label>
                    <div className="flex border border-border rounded-lg overflow-hidden" style={{ height: '400px' }}>
                      {sidebarFiles.length > 0 && (
                        <div className="w-48 shrink-0 border-r border-border bg-muted/30 overflow-y-auto">
                          <button
                            onClick={() => handleSelectFile('__SKILL_MD__')}
                            className={cn(
                              'w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-accent transition-colors',
                              activeFile === '__SKILL_MD__' && 'bg-primary/10 text-primary border-r-2 border-primary',
                            )}
                          >
                            <PenLine className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">SKILL.md</span>
                          </button>
                          <div className="px-3 py-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reference Files</p>
                          </div>
                          {sidebarFiles.map((att) => {
                            const editable = isTextFile(att.name);
                            const isActive = activeFile === att.name;
                            const isLoad = loadingFiles.has(att.name);
                            const isMod = modifiedFiles.has(att.name);
                            return (
                              <button
                                key={att.name}
                                onClick={() => editable && handleSelectFile(att.name)}
                                disabled={!editable || isLoad}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors',
                                  editable ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed',
                                  isActive && 'bg-primary/10 text-primary border-r-2 border-primary',
                                )}
                                title={editable ? att.name : `${att.name} (binary, not editable)`}
                              >
                                {isLoad ? (
                                  <div className="w-3.5 h-3.5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin shrink-0" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{att.name}</span>
                                {isMod && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-auto" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <textarea
                        value={currentEditorContent}
                        onChange={(e) => handleEditorChange(e.target.value)}
                        className="flex-1 px-3 py-2 bg-background font-mono text-sm resize-none focus:outline-none min-w-0"
                        placeholder="When reviewing code, check for:&#10;1. Security vulnerabilities&#10;2. Performance bottlenecks&#10;3. Clean code principles..."
                      />
                    </div>
                  </div>
                )}

                {/* Import Tab */}
                {activeTab === 'import' && (
                  <div className="space-y-3">
                    <FileDropZone
                      onFilesDropped={handleFilesDropped}
                      onMainContent={(content) => setFormData((prev) => ({ ...prev, instructions: content }))}
                      mainFileName="SKILL.md"
                      disabled={uploadingFiles.size > 0}
                      className="py-10"
                    />
                    {formData.instructions && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20 text-sm text-green-600 dark:text-green-400">
                        <PenLine className="w-4 h-4 shrink-0" />
                        Instructions loaded ({formData.instructions.length} chars)
                      </div>
                    )}
                    {(attachments.length > 0 || uploadingFiles.size > 0) && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Uploaded Files</p>
                        <div className="space-y-1">
                          {attachments.map((att) => (
                            <div key={att.name} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-accent/50 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="truncate">{att.name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                              </div>
                              <div className="flex items-center gap-1 ml-2 shrink-0">
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="p-1 text-muted-foreground hover:text-primary" title="Download" onClick={(e) => e.stopPropagation()}>
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                                <button onClick={() => handleRemoveAttachment(att.name)} className="p-1 text-muted-foreground hover:text-destructive" title="Remove">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          {[...uploadingFiles].map((name) => (
                            <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/50 text-sm text-muted-foreground">
                              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin shrink-0" />
                              <span className="truncate">Uploading {name}...</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {pendingFiles.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Queued Files (will upload on save)</p>
                        <div className="space-y-1">
                          {pendingFiles.map((f) => (
                            <div key={f.path} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-primary/5 border border-primary/20 text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-primary shrink-0" />
                                <span className="truncate">{f.path}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.file.size)}</span>
                              </div>
                              <button onClick={() => handleRemoveAttachment(f.path)} className="p-1 text-muted-foreground hover:text-destructive shrink-0" title="Remove">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
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
            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 shrink-0">
              <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-1.5" />
                Save
              </Button>
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
  );
}
