/*
background.js
Handles functions that run in the background, including listening for hotkeys,
opening the search bar, and closing it when outside click is detected.
*/

let uiWindowId = null;
var WIDTH = 420;
var HEIGHT = 210;
var CMD_HEIGHT = 100;
var left;
var right;
var height;

// Click on toolbar icon opens the search bar
chrome.action.onClicked.addListener(async () => {
  if (true) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.warn("No active tab found");
      return;
    }

    try {
      // Try to toggle overlay directly
      await chrome.tabs.sendMessage(tab.id, { type: "tabi_TOGGLE" });
    } catch (err) {
      console.warn("No content script, injecting now…", err);

      try {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });

        // Retry message after injection
        await chrome.tabs.sendMessage(tab.id, { type: "tabi_TOGGLE" });
      } catch (injectErr) {
        console.warn("Injection also failed, opening fallback tab:", injectErr);

        // Fallback: open a safe page (since injection is invalid on chrome:// pages)
        chrome.tabs.create({ url: "https://google.com" }, (newTab) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);

              chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                files: ["content.js"]
              }, () => {
                chrome.tabs.sendMessage(newTab.id, { type: "tabi_TOGGLE" });
              });
            }
          });
        });
      }
    }
  }
});


chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-command-bar") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.warn("No active tab found");
      return;
    }

    try {
      // Try to toggle overlay directly
      await chrome.tabs.sendMessage(tab.id, { type: "tabi_TOGGLE" });
    } catch (err) {
      console.warn("No content script, injecting now…", err);

      try {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });

        // Retry message after injection
        await chrome.tabs.sendMessage(tab.id, { type: "tabi_TOGGLE" });
      } catch (injectErr) {
        console.warn("Injection also failed, opening fallback tab:", injectErr);

        // Fallback: open a safe page
        chrome.tabs.create({ url: "https://google.com" }, (newTab) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === newTab.id && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);

              chrome.scripting.executeScript({
                target: { tabId: newTab.id },
                files: ["content.js"]
              }, () => {
                chrome.tabs.sendMessage(newTab.id, { type: "tabi_TOGGLE" });
              });
            }
          });
        });
      }
    }
  }
});


// Switch to browser window when message is received from popup.js
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "SWITCH_TAB" && msg.title) {
    const targetTitle = msg.title.trim().toLowerCase();

    // Search across browser windows
    const allWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const tabs = allWindows.flatMap(w => w.tabs || []);

    // Try exact, then substring match
    const norm = t => (t.title || "").toLowerCase();
    let candidates = tabs.filter(t => norm(t) === targetTitle);
    if (!candidates.length) {
      candidates = tabs.filter(t => norm(t).includes(targetTitle));
    }

    // Pick most recent tab
    candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const target = candidates[0];

    if (target) {
      await chrome.windows.update(target.windowId, { focused: true });
      await chrome.tabs.update(target.id, { active: true });
      console.log(`Switched to tab: ${target.title}`);
      sendResponse({ success: true, tab: target });
    } else {
      console.log(`No tab found for "${msg.title}"`);
      sendResponse({ success: false });
    }
    return true; 
  }
});
