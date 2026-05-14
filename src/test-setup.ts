import '@testing-library/jest-dom'
import { configureAxe, toHaveNoViolations } from 'jest-axe'
import { expect } from 'vitest'

expect.extend(toHaveNoViolations)

export const axe = configureAxe({
  rules: {
    // color-contrast is checked separately via design tokens; skip in jsdom
    // because jsdom does not compute CSS custom properties
    'color-contrast': { enabled: false },
  },
})
