// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const toast = vi.hoisted(() => ({ fn: null }))
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => toast.fn(...a) })
  const useUI = selector => (selector ? selector(snap()) : snap())
  useUI.getState = snap
  return { useUI }
})
import CatalogueUpdateRow from './CatalogueUpdateRow.jsx'

describe('Settings → Update exercises', () => {
  let host, root
  beforeEach(() => { toast.fn = vi.fn(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
  afterEach(() => { act(() => root.unmount()); host.remove() })

  it.each([
    [{ ids: ['1', '2'], downloaded: true, failed: false, added: 2 }, 'New exercises added: 2'],
    [{ ids: ['1'], downloaded: true, failed: false, added: 0 }, 'Exercises are up to date'],
    [{ ids: [], downloaded: false, failed: true, added: 0 }, 'Could not reach the server. Try again later.'],
  ])('says what happened', async (answer, said) => {
    const update = vi.fn(async () => answer)
    act(() => root.render(<CatalogueUpdateRow update={update} />))
    const row = [...host.querySelectorAll('*')].find(el => el.textContent === 'Update exercises')
    await act(async () => { row.click() })
    expect(update).toHaveBeenCalledTimes(1)
    expect(toast.fn).toHaveBeenCalledWith(said)
  })
})
