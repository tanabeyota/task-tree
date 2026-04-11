import { test, expect } from '@playwright/test';

test('Task Canvas loads and mounts React Flow UI correctly', async ({ page }) => {
  await page.goto('http://localhost:5173');
  
  // Wait for the React Flow viewport to render
  const viewport = page.locator('.react-flow__pane');
  await expect(viewport).toBeVisible();

  // Test double click to create a root node
  await viewport.dblclick({ position: { x: 300, y: 300 } });
  
  const node = page.locator('.task-node-wrapper').first();
  await expect(node).toBeVisible();
});
