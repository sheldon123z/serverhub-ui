import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScriptPreviewEditor } from '@/pages/cron/ScriptPreviewEditor'

const SCRIPT = `#!/bin/bash
echo "hello"
echo "world"`

const SCRIPT_MODIFIED = `#!/bin/bash
echo "hello"
echo "modified"
echo "extra line"`

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('ScriptPreviewEditor', () => {
  it('renders script filename in header', () => {
    render(<ScriptPreviewEditor content={SCRIPT} filePath="~/scripts/test.sh" onContentChange={() => {}} />)
    expect(screen.getByText('~/scripts/test.sh')).toBeInTheDocument()
  })

  it('shows diff view toggle button when originalContent differs', () => {
    render(
      <ScriptPreviewEditor
        content={SCRIPT_MODIFIED}
        filePath="~/scripts/test.sh"
        originalContent={SCRIPT}
        onContentChange={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument()
  })

  it('switching to diff mode shows diff-added or diff-removed elements', () => {
    render(
      <ScriptPreviewEditor
        content={SCRIPT_MODIFIED}
        filePath="~/scripts/test.sh"
        originalContent={SCRIPT}
        onContentChange={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /diff/i }))
    expect(document.querySelector('.diff-removed, .diff-added')).not.toBeNull()
  })

  it('calls onWriteToServer with current content when write button clicked', async () => {
    const onWriteToServer = vi.fn().mockResolvedValue(undefined)
    render(
      <ScriptPreviewEditor
        content={SCRIPT}
        filePath="~/scripts/test.sh"
        onContentChange={() => {}}
        onWriteToServer={onWriteToServer}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /写入服务器/i }))
    expect(onWriteToServer).toHaveBeenCalledWith(SCRIPT)
  })

  it('shows copy button', () => {
    render(<ScriptPreviewEditor content={SCRIPT} filePath="test.sh" onContentChange={() => {}} />)
    expect(screen.getByRole('button', { name: /复制/i })).toBeInTheDocument()
  })
})
