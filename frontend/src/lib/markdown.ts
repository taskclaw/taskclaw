/** Escape HTML special characters */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

/** Lightweight markdown-to-HTML for AI chat messages */
export function renderMarkdown(text: string): string {
    // Remove output_json and tasks_json blocks (parsed by backend / frontend respectively)
    let html = text.replace(/```output_json[\s\S]*?```/g, '')
    html = html.replace(/```tasks_json[\s\S]*?```/g, '')

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
        `<pre class="bg-accent/80 border border-border rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs font-mono whitespace-pre">${escapeHtml(code.trim())}</pre>`)

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="bg-accent/80 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4 class="font-bold text-sm mt-3 mb-1">$1</h4>')
    html = html.replace(/^## (.+)$/gm, '<h3 class="font-bold text-sm mt-3 mb-1">$1</h3>')
    html = html.replace(/^# (.+)$/gm, '<h3 class="font-bold text-base mt-3 mb-1">$1</h3>')

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr class="border-border my-2" />')

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')

    // Numbered lists
    html = html.replace(/^\d+[./] (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')

    // Wrap consecutive <li> tags
    html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul class="my-1 space-y-0.5">$1</ul>')

    // Line breaks (double newline = paragraph, single = br)
    html = html.replace(/\n\n/g, '</p><p class="mt-2">')
    html = html.replace(/\n/g, '<br />')

    // Wrap in paragraph
    html = `<p>${html}</p>`

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '')

    return html
}

/**
 * Extract tasks_json block from AI message content.
 * Returns parsed array or null if no valid block found.
 */
export function extractTasksJson(content: string): Array<{ title: string; priority?: string; notes?: string; card_data?: Record<string, any> }> | null {
    const match = content.match(/```tasks_json\s*\n([\s\S]*?)```/)
    if (!match) return null

    try {
        const parsed = JSON.parse(match[1].trim())
        if (!Array.isArray(parsed) || parsed.length === 0) return null
        // Validate each item has a title
        const valid = parsed.filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
        return valid.length > 0 ? valid : null
    } catch {
        return null
    }
}
