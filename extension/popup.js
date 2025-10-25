/*
popup.js
Handles the main javascript functions, including communicating with the backend API
and carrying out in-browser actions (like modifying/creating/switching tabs).
*/

const input = document.getElementById("search-input");
const results = document.getElementById("results");
const BACKEND_URL = "http://127.0.0.1:8010";

let search_suggestion;

let session = null;

/**
 * Request the Chrome Prompt API to classify the user's intent locally.
 */
async function getIntent(prompt) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "GET_INTENT", prompt }, (resp) => {
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (!resp || !resp.result) {
          console.warn("Local LanguageModel failed or unavailable.");
          resolve(null);
          return;
        }
        // console.log("Intent from local model:", resp.result);
        resolve(resp.result);
      });
    });
  } catch (err) {
    console.error("getIntent() failed:", err);
    return null;
  }
}


/**
 * Run the local Prompt API with structured schema to satisfy the user's intent.
 */
async function executeIntent(intent, prompt, groupedTabs) {
  try {

    if (intent.startsWith('"') && intent.endsWith('"')) {
      intent = intent.slice(1, -1);
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    console.log("executeIntent received: ", intent);
    console.log("of type: ", typeof (intent));

    // Define schemas equivalent to your Python Pydantic models
    const schemas = {
      "search_tabs": {
        type: "object",
        properties: {
          action: { type: "string", enum: ["search_tabs"] },
          output: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              description: { type: "string" }
            },
            required: ["title", "url", "description"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["action", "output", "confidence"]
      },

      "close_tabs": {
        type: "object",
        properties: {
          action: { type: "string", enum: ["close_tabs"] },
          output: {
            type: "object",
            properties: {
              tabs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    description: { type: "string" }
                  },
                  required: ["title", "url", "description"]
                }
              }
            },
            required: ["tabs"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["action", "output", "confidence"]
      },

      "organize_tabs": {
        type: "object",
        properties: {
          action: { type: "string", enum: ["organize_tabs"] },
          output: {
            type: "object",
            properties: {
              tabs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    group_name: { type: "string" },
                    tabs: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          url: { type: "string" },
                          description: { type: "string" }
                        },
                        required: ["title", "url", "description"]
                      }
                    }
                  },
                  required: ["group_name", "tabs"]
                }
              }
            },
            required: ["tabs"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["action", "output", "confidence"]
      },

      "generate_tabs": {
        type: "object",
        properties: {
          action: { type: "string", enum: ["generate_tabs"] },
          output: {
            type: "object",
            properties: {
              group_name: { type: "string" },
              tabs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    description: { type: "string" }
                  },
                  required: ["title", "url", "description"]
                }
              }
            },
            required: ["group_name", "tabs"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["action", "output", "confidence"]
      }
    };

    // Get the appropriate schema based on intent
    const schema = schemas[intent];

    if (!schema) {
      console.error("Unknown intent:", intent);
      return null;
    }

    // Flatten grouped tabs into a simple list for the prompt
    const allTabs = groupedTabs.flatMap(group =>
      group.tabs.map(t => ({
        title: t.title,
        url: t.url,
        group: group.group_name
      }))
    );

    // Format tabs information for the prompt
    const tabsInfo = allTabs.map((t, i) =>
      `${i + 1}. [${t.group}] "${t.title}" - ${t.url}`
    ).join("\n");

    // Create the query for the model based on intent
    let query = "";

    if (intent === "search_tabs") {
      query = `
You are a tab search assistant. Find the tab that best matches the user's request.

User request: "${prompt}"

Available tabs:
${tabsInfo}

Return a JSON response with:
- action: "search_tabs"
- output: { title: "exact tab title", url: "exact tab url", description: "why this tab matches" }
- confidence: a number between 0 and 1

Return ONLY valid JSON. No additional text.`.trim();
    }
    else if (intent === "close_tabs") {
      query = `
You are a tab cleanup assistant. Identify which tabs should be closed based on the user's request.

User request: "${prompt}"

Available tabs:
${tabsInfo}

Return a JSON response with:
- action: "close_tabs"
- output: { tabs: [{ title: "exact title", url: "exact url", description: "reason" }, ...] }
- confidence: a number between 0 and 1

Return ONLY valid JSON. No additional text.`.trim();
    }
    else if (intent === "organize_tabs") {
      query = `
You are a tab organization assistant. Group the tabs into logical categories.

User request: "${prompt}"

Available tabs:
${tabsInfo}

Return a JSON response with:
- action: "organize_tabs"
- output: { tabs: [{ group_name: "category", tabs: [{ title, url, description }, ...] }, ...] }
- confidence: a number between 0 and 1

Return ONLY valid JSON. No additional text.`.trim();
    }
    else if (intent === "generate_tabs") {
      query = `
You are a tab generation assistant. Create a list of useful tabs/URLs based on the user's request.

User request: "${prompt}"

Return a JSON response with:
- action: "generate_tabs"
- output: { group_name: "descriptive name", tabs: [{ title: "page title", url: "full url", description: "what it's for" }, ...] }
- confidence: a number between 0 and 1

Generate 5-10 relevant, high-quality URLs. Return ONLY valid JSON. No additional text.`.trim();
    }

    // Send message to content script to call local model with schema
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "PROCESS_WITH_SCHEMA",
          prompt: query,
          schema: schema
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          if (!resp || !resp.result) {
            console.warn("Local LanguageModel failed or unavailable.");
            resolve(null);
            return;
          }

          try {
            // Parse the JSON response
            const parsed = JSON.parse(resp.result);
            console.log("Parsed local model response:", parsed);
            resolve(parsed);
          } catch (err) {
            console.error("Failed to parse model response:", err);
            console.error("Raw response was:", resp.result);
            resolve(null);
          }
        }
      );
    });

  } catch (err) {
    console.error("executeIntent() failed:", err);
    return null;
  }
}


/**
 * Sets the status UI in the popup
 */

function setStatus(message, isLoading = false, isError = false) {
  if (!results) return;

  const searchBar = document.querySelector('.search-bar');
  searchBar.style.borderRadius = '30px 30px 0 0';

  results.style.display = "block";

  if (isLoading) {
    results.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px;">
        <span style="color:#cbd5e1;font-size:0.85rem;border:none;font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;">${message}</span>
        <div class="progress">
          <div class="progress-value"></div>
        </div>
      </div>
    `;
  } else {
    results.innerHTML = `
      <div style="font-size:0.8rem;color:${isError ? "#f87171" : "#86efac"};text-align:center;padding:6px 0;">
        ${message}
      </div>
    `;

    // Reset border radius after a delay
    setTimeout(() => {
      searchBar.style.borderRadius = '30px';
      results.style.display = 'none';
    }, 10000);
  }
}


/**
 * Core function to execute the agent. Retrieve data using an http request, and 
 * execute corresponding function.
 */
async function execute_cmd() {
  const userPrompt = input.value.trim();

  if (!userPrompt) return;
  setStatus("Executing command…", true);

  const intent = await getIntent(userPrompt);
  console.log("intentLlm:", intent);

  if (!intent) {
    setStatus("Unable to determine intent (local & backend failed)", false, true);
    return;
  }
  // Get currently open tabs to send as context
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focusedWin = windows.find(w => w.focused) || windows[0];

  if (!focusedWin) {
    console.error("No normal browser window found.");
    return;
  }


  const tabs = await chrome.tabs.query({ windowId: focusedWin.id });
  const tabGroups = await chrome.tabGroups.query({ windowId: focusedWin.id });

  console.warn("Tabs:", tabs)
  console.warn("Groups: ", tabGroups)

  const groupedTabs = [];

  // Add real tab groups
  for (const group of tabGroups) {
    const groupTabs = tabs.filter(t => t.groupId === group.id);
    if (groupTabs.length === 0) continue;

    groupedTabs.push({
      group_name: group.title || "Unnamed Group",
      tabs: groupTabs.map(t => ({
        title: t.title || "",
        url: t.url || "",
        description: t.title || "", // fallback
      })),
    });
  }

  // Add ungrouped tabs
  const ungroupedTabs = tabs.filter(t => t.groupId === -1);
  if (ungroupedTabs.length > 0) {
    groupedTabs.push({
      group_name: "Ungrouped",
      tabs: ungroupedTabs.map(t => ({
        title: t.title || "",
        url: t.url || "",
        description: t.title || "",
      })),
    });
  }

  console.warn(groupedTabs)

  const client_id = await getClientId();

  // Send all the tabs, organized in tab groups, to the agent as context
  try {

    const local_resp = await executeIntent(intent, userPrompt, groupedTabs);
    console.log("Local response: ", local_resp);
    var result = {}

    if (parseFloat(local_resp["confidence"]) >= 0.80) {
      result = local_resp;
    }

    else {

      const response = await fetch(`${BACKEND_URL}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          context: { tabs: groupedTabs, client_id: client_id },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Backend error:", errorText);
        setStatus("Backend error", false, true);
        return;
      }

      result = await response.json();
      console.warn("Agent result:", result);
      console.warn("Agent result of type", typeof (result))
    }


    // Execute function based on agent's response
    if (result.action === "organize_tabs") {
      setStatus("Organizing tabs…", true);
    } else if (result.action === "generate_tabs") {
      setStatus("Generating tabs…", true);
    } else if (result.action === "search_tabs") {
      setStatus("Searching tabs…", true);
    } else if (result.action === "close_tabs") {
      setStatus("Cleaning up your tabs…", true);
    }

    await handleAgentResponse(result, tabs, focusedWin);
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("Failed to execute command.", false, true);
  }
}

/**
 * Handle actions returned by the backend agent
 */
async function handleAgentResponse(result, tabs, focusedWin) {

  switch (result.action) {
    case "organize_tabs":
      await organizeTabsFrontend(tabs, result.output?.tabs || [], focusedWin);
      setStatus("Tabs organized successfully!");
      break;

    case "generate_tabs":
      await openGeneratedTabs(result.output.group_name, result.output.tabs, focusedWin);
      setStatus(`Your tabs are saved in: ${result.output.group_name}`);
      break;

    case "search_tabs":
      await switchToTab(result.output.title);
      setStatus("Your tab was found!");
      break;

    case "close_tabs":
      await handleTabClosures(result.output.tabs);
      setStatus("Your tab have been cleaned up!");
      break;

    default:
      console.warn("Unknown action from backend:", result.action);
      setStatus("Unknown action returned from agent.", false, true);
      break;
  }
}

/**
 * Group existing tabs by category
 */
async function organizeTabsFrontend(tabs, groups, targetWin) {
  for (const group of groups) {
    const groupName = group.group_name;


    if (groupName === "Ungrouped") {
      // Find tab IDs that should be ungrouped
      const tabIds = tabs
        .filter(t => group.tabs.some(gTab => gTab.title === t.title))
        .map(t => t.id);

      for (const id of tabIds) {
        try {
          await chrome.tabs.ungroup(id);
        } catch (e) {
          console.warn("Failed to ungroup tab:", id, e);
        }
      }
      continue;
    }

    // Map tabs by matching title
    const tabIds = tabs
      .filter(tab => group.tabs.some(gTab => gTab.title === tab.title))
      .map(tab => tab.id);

    if (tabIds.length > 0) {
      const groupId = await chrome.tabs.group({
        tabIds,
        createProperties: { windowId: targetWin.id },
      });
      await chrome.tabGroups.update(groupId, {
        title: groupName,
        color: getGroupColor(groupName),
        collapsed: true,
      });
    }
  }
}


/**
 * Open generated tabs in a new tab group
 */
async function openGeneratedTabs(groupName, tabs, targetWin) {
  const newTabIds = [];

  for (const tab of tabs) {
    if (tab.url) {
      const newTab = await chrome.tabs.create({
        url: tab.url,
        active: false,
      });
      newTabIds.push(newTab.id);
    }
  }

  if (newTabIds.length > 0) {
    const groupId = await chrome.tabs.group({
      tabIds: newTabIds,
      createProperties: { windowId: targetWin.id },
    });
    await chrome.tabGroups.update(groupId, {
      title: groupName,
      color: getGroupColor(groupName),
      collapsed: true,
    });
  }
}

/**
 * Switch to a tab with a matching title
 */
async function switchToTab(title) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "SWITCH_TAB", title }, response => {
      if (response?.success) {
        console.log("Switched successfully:", response.tab);
      } else {
        console.warn("No tab matched:", title);
      }
      resolve(response);
    });
  });
}


/**
 * Close tabs that match the given list of titles or objects
 */
async function handleTabClosures(toCloseTabs) {

  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const focusedWin = windows.find(w => w.focused) || windows[0];

  if (!focusedWin) {
    console.error("No normal browser window found.");
    return;
  }

  const tabs = await chrome.tabs.query({ windowId: focusedWin.id });
  const tabData = tabs.map(tab => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
  }));
  console.warn(tabData)

  // Match tabs to close
  const tabIdsToClose = tabData
    .filter(tab =>
      // If backend returns list of titles
      typeof toCloseTabs[0] === "string"
        ? toCloseTabs.includes(tab.title)
        // If backend returns list of objects { title, url }
        : toCloseTabs.some(closeTab => closeTab.title === tab.title)
    )
    .map(tab => tab.id);

  // Close matched tabs
  if (tabIdsToClose.length > 0) {
    await chrome.tabs.remove(tabIdsToClose);
    console.log("Closed tabs:", tabIdsToClose);
  } else {
    console.warn("No matching tabs found to close.");
  }
}


/**
 * Deterministic color assignment for tab groups
 */
function getGroupColor(name) {
  const colors = [
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Generate rotating suggestions for the input placeholder
 */
function cycle_suggestions() {
  const start = "Ask Tabi to... ";

  const suggestions_lst = [
    "organize my tabs",
    "create a calculus study guide",
    "setup tabs for buying a PC",
    "close all distracting tabs",
    "find the CNN article I opened",
  ];
  const index = Math.floor(Math.random() * suggestions_lst.length);

  return start + suggestions_lst[index];
}

// === Pressing enter triggers the backend ===
if (input) {
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") execute_cmd();
  });
}


document.addEventListener("DOMContentLoaded", () => {
  if (!input) return;

  search_suggestion = cycle_suggestions();
  input.placeholder = search_suggestion;
  input.focus();
  input.select();

});


/**
 * Ensure we have a stable per-install client identifier stored locally.
 */
async function getClientId() {
  const { client_id } = await chrome.storage.local.get("client_id");

  if (!client_id) {
    const new_id = crypto.randomUUID();
    await chrome.storage.local.set({ client_id: new_id });
    return new_id;
  }

  return client_id;
}


/**
 * Return all the bookmarks as a cleaned tree object
 */
async function getBookmarkTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      try {
        const simplify = (arr) => {
          return arr.map((node) => ({
            id: node.id,
            title: node.title || "",
            url: node.url || null,
            children: node.children ? simplify(node.children) : [],
          }));
        };

        resolve(simplify(nodes));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Return all the bookmarks TITLES, cleaned and formatted
 */
async function getAllBookmarkTitles() {

  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((nodes) => {
      try {
        const bookmarks = [];

        const walk = (arr) => {
          for (const n of arr) {
            if (n.url) {
              // push directly in the format show_results expects
              bookmarks.push({
                label: n.title.split(/\s+/).slice(0, 2).join(" ").replace(/[#\-_|\\/\><,!`$%^&*()+=]/g, ""), // first 2 words
                type: "bookmark",
              });
            }
            if (n.children) walk(n.children);
          }
        };

        walk(nodes);
        resolve(bookmarks);
      } catch (e) {
        reject(e);
      }
    });
  });
}

window.addEventListener("message", async (event) => {
  if (event.data?.type === "FOCUS_SEARCH") {
    const input = document.getElementById("search-input");

    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const focusedWin = windows.find(w => w.focused) || windows[0];

    if (!focusedWin) {
      console.error("No normal browser window found.");
      return;
    }

    const tabs = await chrome.tabs.query({ windowId: focusedWin.id });

    const tabTitles = tabs.map(t => ({
      label: t.title.split(/\s+/).slice(0, 2).join(" ").replace(/[#\-_|\\/\.><,!`$%^&*()+=]/g, ""),
      type: "tab"
    }));

    const bookmark_titles = await getAllBookmarkTitles();  // returns array of strings

    // Quick access to commonly used pages
    const chrome_pages = [
      { label: "Settings", type: "chrome_settings", url: "chrome://settings/" },
      { label: "History", type: "chrome_history", url: "chrome://history/" },
      { label: "Bookmarks", type: "chrome_bookmarks", url: "chrome://bookmarks/" },
      { label: "Downloads", type: "chrome_downloads", url: "chrome://downloads/" },
      { label: "Extensions", type: "chrome_extensions", url: "chrome://extensions/" },
      { label: "Clear Browsing Data", type: "chrome_clear_data", url: "chrome://settings/clearBrowserData" },
      { label: "Passwords", type: "chrome_passwords", url: "chrome://settings/passwords" },
      { label: "Chrome Webstore", type: "chrome_webstore", url: "https://chromewebstore.google.com/" }
    ];


    // Combine both lists into one
    const all_tabs = [...tabTitles, ...bookmark_titles, ...chrome_pages];

    show_results(all_tabs)

    if (input) {
      input.focus();
      input.select();
    }
  }
});


/**
 * Uses autocompleteJS to determine a list of strings matching user input, and display them
 * in an appropriate format.
 * Expect: list = [{ label: "Khan Academy", type: "bookmark" }, { label: "GitHub", type: "tab" }, ...]
 */
function show_results(list) {

  if (!Array.isArray(list) || list.length === 0) {
    console.warn("No results to show:", list);
    return;
  }

  // Destroy any old dropdowns to prevent duplicates
  document.querySelectorAll(".autoComplete_wrapper ul").forEach(el => el.remove());

  // Create the autocomplete instance
  const autoCompleteJS = new autoComplete({
    selector: "#search-input",
    placeHolder: cycle_suggestions(),
    data: {
      src: list,
      keys: ["label"],
    },
    resultsList: {
      maxResults: 5,
      class: "auto-results",
    },
    resultItem: {
      highlight: false,
      element: (item, data) => {
        item.innerHTML = "";

        // Text (render match markup properly)
        const text = document.createElement("span");
        text.innerHTML = data.match;
        text.className = "result-text";

        // Icon (differentiate bookmarks and tabs)
        const icon = document.createElement("i");
        const ICON_MAP = {
          // existing types
          "bookmark": "fa-solid fa-bookmark result-icon bookmark",
          "tab": "fa-solid fa-globe result-icon tab",

          // chrome:// pages
          "chrome_settings": "fa-solid fa-gear result-icon chrome",
          "chrome_history": "fa-solid fa-clock-rotate-left result-icon chrome",
          "chrome_bookmarks": "fa-solid fa-book result-icon chrome",
          "chrome_downloads": "fa-solid fa-download result-icon chrome",
          "chrome_extensions": "fa-solid fa-puzzle-piece result-icon chrome",
          "chrome_clear_data": "fa-solid fa-broom result-icon chrome",
          "chrome_passwords": "fa-solid fa-key result-icon chrome",
          "chrome_webstore": "fa-solid fa-bag-shopping"
        };

        const colorMap = {
          "bookmark": "#00A2FF",
          "chrome_bookmarks": "#00A2FF",
          "tab": "#00ff99",
          "chrome_settings": "#686f77",
          "chrome_clear_data": "#FF6B6B",
          "chrome_webstore": "#C792EA"
        };

        icon.className = ICON_MAP[data.value.type] || "fa-solid fa-circle-question result-icon";
        icon.style = `color:${colorMap[data.value.type]};`

        // Layout container
        const wrapper = document.createElement("div");
        wrapper.className = "result-item-wrapper";
        wrapper.style.display = "flex";
        wrapper.style.justifyContent = "space-between";
        wrapper.style.alignItems = "center";
        wrapper.style.width = "100%";

        wrapper.appendChild(text);
        wrapper.appendChild(icon);
        item.appendChild(wrapper);
      },
    },

    events: {
      input: {
        selection: async (event) => {
          const value = event.detail.selection.value;
          console.log("Selected:", value);

          // Handle based on type, find and activate tab by title
          if (value.type === "tab") {
            const tabs = await chrome.tabs.query({});
            const target = tabs.find(t => t.title.includes(value.label));
            if (target) {
              await chrome.tabs.update(target.id, { active: true });
              await chrome.windows.update(target.windowId, { focused: true });
            } else {
              console.warn("Tab not found:", value.label);
            }
          }

          // Open bookmark in a new tab
          if (value.type === "bookmark") {
            const bookmarks = await chrome.bookmarks.search(value.label);
            if (bookmarks.length > 0 && bookmarks[0].url) {
              await chrome.tabs.create({ url: bookmarks[0].url, active: true });
            } else {
              console.warn("Bookmark not found:", value.label);
            }
          }

          else {
            const CHROME_PAGES = {
              chrome_settings: "chrome://settings/",
              chrome_history: "chrome://history/",
              chrome_bookmarks: "chrome://bookmarks/",
              chrome_downloads: "chrome://downloads/",
              chrome_extensions: "chrome://extensions/",
              chrome_clear_data: "chrome://settings/clearBrowserData",
              chrome_passwords: "chrome://settings/passwords",
              chrome_webstore: "https://chromewebstore.google.com/"
            };

            const url = CHROME_PAGES[value.type];

            if (url) {
              await chrome.tabs.create({ url, active: true });
            } else {
              console.warn("Unknown chrome page type:", value.type);
            }
          }
        },
      },
    },

  });
}
