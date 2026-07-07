/**
 * Kirameki palette — gyaru pink & gold on a dark plum void.
 *
 * Hue roles: pink = the agent (primary hologram), gold = the user and tools,
 * purple = thinking/dispatch, mint = success/returns, red = errors.
 * All colors are re-exported from agent-types.ts for backward compatibility.
 */

import type { AgentState, ContextBreakdown } from './agent-types'

// Kirameki Color Palette
export const COLORS = {
  // Background
  void: '#0f0510',
  hexGrid: '#1d0d1a',

  // Primary Hologram
  holoBase: '#ff66cc',
  holoBright: '#ffaadd',
  holoHot: '#ffffff',

  // Agent States
  idle: '#ff66cc',
  thinking: '#ff66cc',
  tool_calling: '#ffd24d',
  complete: '#66ffaa',
  error: '#ff5566',
  paused: '#998895',
  waiting_permission: '#ffaa33',

  // Edge/Particle Colors
  dispatch: '#cc88ff',
  return: '#66ffaa',
  tool: '#ffd24d',
  message: '#ff66cc',

  // Context breakdown colors
  contextSystem: '#665577',      // gray-plum — fixed overhead
  contextUser: '#ff66cc',        // pink — user input
  contextToolResults: '#ffd24d', // gold — expensive!
  contextReasoning: '#cc88ff',   // purple — agent thinking
  contextSubagent: '#66ffaa',    // mint — child agent results

  // UI Chrome
  nodeInterior: 'rgba(40, 10, 32, 0.5)',
  textPrimary: '#ffd9ee',
  textDim: '#ff66cc90',
  textMuted: '#ff66cc50',

  // Glass card
  glassBg: 'rgba(30, 10, 24, 0.7)',
  glassBorder: 'rgba(255, 150, 215, 0.15)',
  glassHighlight: 'rgba(255, 150, 215, 0.08)',

  // Holo background/border opacities (avoids scattered rgba literals)
  holoBg03: 'rgba(255, 150, 215, 0.03)',
  holoBg05: 'rgba(255, 150, 215, 0.05)',
  holoBg10: 'rgba(255, 150, 215, 0.1)',
  holoBorder06: 'rgba(255, 150, 215, 0.06)',
  holoBorder08: 'rgba(255, 150, 215, 0.08)',
  holoBorder10: 'rgba(255, 150, 215, 0.1)',
  holoBorder12: 'rgba(255, 150, 215, 0.12)',

  // Panel chrome
  panelBg: 'rgba(26, 8, 20, 0.85)',
  panelSeparator: 'rgba(255, 150, 215, 0.04)',

  // Toggle button states
  toggleActive: 'rgba(255, 150, 215, 0.15)',
  toggleInactive: 'rgba(255, 150, 215, 0.05)',
  toggleBorder: 'rgba(255, 150, 215, 0.1)',

  // Live indicator
  liveDot: '#ff4444',
  liveText: '#ff6666',
  liveResumeBg: 'rgba(255, 68, 68, 0.15)',
  liveResumeBorder: 'rgba(255, 68, 68, 0.35)',

  // Discovery type colors
  discoveryFile: '#ff66cc',
  discoveryPattern: '#cc88ff',
  discoveryFinding: '#66ffaa',
  discoveryCode: '#ffd24d',

  // Session tab states
  tabSelectedBg: 'rgba(255, 150, 215, 0.15)',
  tabInactiveBg: 'rgba(255, 150, 215, 0.03)',
  tabSelectedBorder: 'rgba(255, 150, 215, 0.3)',
  tabInactiveBorder: 'rgba(255, 150, 215, 0.08)',
  tabClose: '#ff6688',

  // Role colors (message bubbles)
  roleAssistantBg: 'rgba(240, 100, 190, 0.12)',
  roleAssistantBgSelected: 'rgba(240, 100, 190, 0.2)',
  roleAssistantText: '#ffb3e0',
  roleThinkingBg: 'rgba(140, 100, 200, 0.12)',
  roleThinkingBgSelected: 'rgba(140, 100, 200, 0.2)',
  roleThinkingText: '#c0a0e0',
  roleUserBg: 'rgba(220, 170, 70, 0.12)',
  roleUserBgSelected: 'rgba(220, 170, 70, 0.2)',
  roleUserText: '#f0d090',

  // Result/success
  resultBg: 'rgba(102, 255, 170, 0.05)',
  resultBorder: 'rgba(102, 255, 170, 0.1)',

  // Unread indicator
  unreadDot: '#ff6666',

  // Play button
  playBtnBg: 'rgba(255, 102, 204, 0.12)',
  playBtnActiveBg: 'rgba(255, 102, 204, 0.2)',
  playBtnBorder: 'rgba(255, 102, 204, 0.4)',
  playBtnGlow: '0 0 12px rgba(255, 102, 204, 0.15)',

  // Scrubber
  scrubberFill: 'linear-gradient(90deg, rgba(255,102,204,0.3), rgba(255,102,204,0.6))',
  scrubberHeadGlow: '0 0 10px rgba(255, 102, 204, 0.6), 0 0 20px rgba(255, 102, 204, 0.2)',
  reviewBtnBorder: 'rgba(255, 102, 204, 0.25)',

  // Cost overlay
  costActiveBg: 'rgba(255, 210, 77, 0.15)',

  // Canvas drawing — bubble base colors (partial rgba, alpha appended at draw time)
  bubbleThinkingBase: 'rgba(140, 100, 200,',
  bubbleUserBase: 'rgba(220, 170, 70,',
  bubbleAssistantBase: 'rgba(240, 100, 190,',

  // Canvas drawing — tool card backgrounds (partial rgba, alpha appended at draw time)
  toolCardErrorBase: 'rgba(40, 10, 15,',
  toolCardSelectedBase: 'rgba(255, 150, 215,',
  toolCardBase: 'rgba(30, 10, 24,',

  // Canvas drawing — agent/tool card backgrounds
  cardBgDark: 'rgba(15, 5, 16, 0.8)',
  cardBg: 'rgba(30, 10, 24, 0.6)',
  cardBgSelected: 'rgba(30, 10, 24, 0.8)',
  cardBgError: 'rgba(40, 10, 15, 0.8)',
  cardBgSelectedHolo: 'rgba(255, 150, 215, 0.15)',
  cardBgFaintOverlay: 'rgba(0, 0, 0, 0.01)',

  // Active tool indicator (detail card)
  toolIndicatorBg: 'rgba(255, 210, 77, 0.1)',
  toolIndicatorBorder: 'rgba(255, 210, 77, 0.2)',
  toolIndicatorText: '#ffd24d',

  // Canvas drawing — cost labels (cost = money = gold)
  costText: '#ffd24d',
  costTextDim: '#ffd24d80',
  costPillBg: 'rgba(32, 20, 8, 0.75)',
  costPillStroke: 'rgba(255, 210, 77, 0.3)',

  // Canvas drawing — cost panel bar fills
  barFillMain: 'rgba(255, 102, 204, 0.15)',
  barFillSub: 'rgba(204, 136, 255, 0.15)',

  // ─── Transcript / message feed colors ───────────────────────────────────────

  // User messages
  userMsgBg: 'rgba(255, 210, 77, 0.06)',
  userMsgBorder: 'rgba(255, 210, 77, 0.12)',
  userLabel: '#ffd24d90',
  userText: '#ffdd88',

  // Assistant messages
  assistantLabel: '#ff66cc80',
  assistantText: '#ffd9ee',

  // Thinking messages
  thinkingBgExpanded: 'rgba(180, 140, 255, 0.06)',
  thinkingBgCollapsed: 'rgba(180, 140, 255, 0.03)',
  thinkingBorder: 'rgba(180, 140, 255, 0.08)',
  thinkingLabel: '#bb99ff70',
  thinkingArrow: '#bb99ff55',
  thinkingPreview: '#bb99ff',
  thinkingTextExpanded: '#bb99ff80',
  thinkingBorderLeft: 'rgba(180, 140, 255, 0.15)',

  // Tool call messages
  toolCallBg: 'rgba(255, 210, 77, 0.05)',
  toolCallBorder: 'rgba(255, 210, 77, 0.1)',

  // Tool result messages
  bashResultBg: 'rgba(0,0,0,0.25)',
  toolResultBg: 'rgba(102, 255, 170, 0.04)',
  bashResultBorder: 'rgba(255, 210, 77, 0.1)',
  toolResultBorder: 'rgba(102, 255, 170, 0.08)',
  bashResultText: '#ffd9ee80',
  toolResultText: '#66ffaa80',
  textFaint: '#ffd9ee60',

  // Search highlight
  searchHighlightBg: 'rgba(255,210,77,0.3)',

  // ─── Diff / code block colors ───────────────────────────────────────────────

  codeBlockBg: 'rgba(0,0,0,0.3)',
  diffRemoved: '#ff6666',
  diffRemovedBg: 'rgba(255,80,80,0.08)',
  diffAdded: '#66ff88',
  diffAddedBg: 'rgba(80,255,120,0.08)',

  // ─── Tool content colors ────────────────────────────────────────────────────

  filePathActive: '#ff66cc',
  filePathInactive: '#ff66cc90',
  todoCompleted: '#66ffaa',
  todoCompletedText: '#66ffaa90',
  todoPending: '#ff66cc60',
  contentDim: '#ffd9ee90',
  searchIcon: '#ff66cc60',

  // ─── Panel header / chrome text ─────────────────────────────────────────────

  panelLabel: '#ff66cc90',
  panelLabelDim: '#ff66cc65',
  scrollBtnText: '#ff66cc',
  scrollbarThumb: 'rgba(255,150,215,0.15)',
} as const

// ─── Role Colors (message feed & bubbles) ───────────────────────────────────

export const ROLE_COLORS: Record<string, { bg: string; bgSelected: string; text: string; label: string }> = {
  assistant: { bg: COLORS.roleAssistantBg, bgSelected: COLORS.roleAssistantBgSelected, text: COLORS.roleAssistantText, label: 'CLIO' },
  thinking:  { bg: COLORS.roleThinkingBg,  bgSelected: COLORS.roleThinkingBgSelected,  text: COLORS.roleThinkingText,  label: 'THINKING' },
  user:      { bg: COLORS.roleUserBg,       bgSelected: COLORS.roleUserBgSelected,       text: COLORS.roleUserText,       label: 'USER' },
} as const

// ─── Color Helper Functions ──────────────────────────────────────────────────

export function getStateColor(state: AgentState): string {
  switch (state) {
    case 'idle': return COLORS.idle
    case 'thinking': return COLORS.thinking
    case 'tool_calling': return COLORS.tool_calling
    case 'complete': return COLORS.complete
    case 'error': return COLORS.error
    case 'paused': return COLORS.paused
    case 'waiting_permission': return COLORS.waiting_permission
  }
}

export function getDiscoveryTypeColor(type: string): string {
  switch (type) {
    case 'file': return COLORS.discoveryFile
    case 'pattern': return COLORS.discoveryPattern
    case 'finding': return COLORS.discoveryFinding
    default: return COLORS.discoveryCode
  }
}

/** Safely combine a partial rgba base (e.g. 'rgba(30, 10, 24,') with an alpha value */
export function withAlpha(rgbaBase: string, alpha: number): string {
  return `${rgbaBase} ${alpha})`
}

/** Build the context-breakdown color segments for a given breakdown. */
export function contextSegments(bd: ContextBreakdown) {
  return [
    { value: bd.systemPrompt, color: COLORS.contextSystem },
    { value: bd.userMessages, color: COLORS.contextUser },
    { value: bd.toolResults, color: COLORS.contextToolResults },
    { value: bd.reasoning, color: COLORS.contextReasoning },
    { value: bd.subagentResults, color: COLORS.contextSubagent },
  ]
}
