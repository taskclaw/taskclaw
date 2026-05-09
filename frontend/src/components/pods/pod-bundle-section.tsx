'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { exportPodBundle, importPodBundle } from '@/app/dashboard/pods/bundle-actions';

interface PodBundleSectionProps {
  podId: string;
  podName: string;
  podSlug: string;
}

/**
 * Pod Bundle export/import controls (PRD §6).
 *
 * Export → downloads a deterministic pod.bundle.json the user can share,
 * version-control, or hand off as the seed of a marketplace listing.
 *
 * Import → reads any pod.bundle.json, POSTs it to the import endpoint, and
 * navigates to the newly-created Pod. Missing integrations surface as a
 * toast-warning so the user knows what to wire up before running the Pod.
 */
export function PodBundleSection({ podId, podName, podSlug }: PodBundleSectionProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onExport() {
    setExporting(true);
    try {
      const bundle = await exportPodBundle(podId);
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pod-${podSlug}.bundle.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported "${podName}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function onImportPicked(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Selected file is not valid JSON');
      }
      const report = await importPodBundle(parsed);
      const summary = `Created ${report.created.boards} boards, ${report.created.columns} columns, ${report.created.agents} agents, ${report.created.skills} skills`;
      if (report.missing_integrations.length > 0) {
        toast.warning(
          `Imported with ${report.missing_integrations.length} missing integration(s) — configure them under Integrations.`,
          { description: summary },
        );
      } else {
        toast.success('Pod imported', { description: summary });
      }
      // The slug we end up with may have a -N suffix; route via the new id.
      router.push(`/dashboard/pods/${podSlug}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="border border-border/60 rounded-lg p-4 mt-8 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Pod Bundle</h3>
        <p className="text-xs text-muted-foreground">
          Export this Pod as a portable JSON file (boards, columns, agents, skills, knowledge,
          integrations required) — share it, commit it, or import it into another workspace.
          Secrets are never included.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <Download className="mr-2 h-3 w-3" />
          )}
          Export bundle
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInput.current?.click()}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <FileUp className="mr-2 h-3 w-3" />
          )}
          Import bundle
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportPicked(f);
          }}
        />
      </div>
    </div>
  );
}
