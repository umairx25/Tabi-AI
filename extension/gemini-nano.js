let session = null;

export async function getIntent(prompt) {
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
        resolve(resp.result);
      });
    });
  } catch (err) {
    console.error("getIntent() failed:", err);
    return null;
  }
}


export async function executeIntent(intent, prompt, groupedTabs, bookmark_tree, bookmark_titles) {
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
      },

      // === NEW BOOKMARK SCHEMAS ===
      "remove_bookmarks": {
        type: "object",
        properties: {
          action: { type: "string", enum: ["remove_bookmarks"] },
          output: {
            type: "object",
            properties: {
              bookmarks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    url: { type: "string" }
                  },
                  required: ["id", "title"]
                }
              }
            },
            required: ["bookmarks"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["action", "output", "confidence"]
      },

      "search_bookmarks": {
        type: "object",
        properties: {
          action: { type: "string", enum: ["search_bookmarks"] },
          output: {
            type: "object",
            properties: {
              bookmarks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    url: { type: "string" }
                  },
                  required: ["id", "title"]
                }
              }
            },
            required: ["bookmarks"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["action", "output", "confidence"]
      },

    "organize_bookmarks": {
  type: "object",
  properties: {
    action: { type: "string", enum: ["organize_bookmarks"] },
    output: {
      type: "object",
      properties: {
        reorganized_bookmarks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              move_to_folder: { type: "string" }
            },
            required: ["id", "move_to_folder"]
          }
        },
        tabs_to_add: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tab_title: { type: "string" },
              tab_url: { type: "string" },
              folder_title: { type: "string" }
            },
            required: ["tab_title", "tab_url", "folder_title"]
          }
        }
      },
      required: ["reorganized_bookmarks"]
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

    const tabsText = allTabs.map(
                    (t, i) => `${i + 1}. [${t.group}] "${t.title}" - ${t.url}`
                    ).join("\n");
    
    bookmark_tree = JSON.stringify(bookmark_tree, null, 2);



switch (intent) {
  // === TAB INTENTS ===
  case "search_tabs":
    query = `
      You are a tab search assistant. Find the tab that best matches the user's request.

      User request: "${prompt}"

      Available tabs:
      ${tabsText}

      Return a JSON response with:
      - action: "search_tabs"
      - output: { title: "exact tab title", url: "exact tab url", description: "why this tab matches" }
      - confidence: a number between 0 and 1

      Return ONLY valid JSON. No additional text.
    `.trim();
    console.log("Search tabs reached, and LLM returned: ", query);
    break;

  case "close_tabs":
    query = `
      You are a tab cleanup assistant. Identify which tabs should be closed based on the user's request.

      User request: "${prompt}"

      Available tabs:
      ${tabsInfo}

      Return a JSON response with:
      - action: "close_tabs"
      - output: { tabs: [{ title: "exact title", url: "exact url", description: "reason" }, ...] }
      - confidence: a number between 0 and 1

      Return ONLY valid JSON. No additional text.
    `.trim();
    break;

  case "organize_tabs":
    query = `
      You are a tab organization assistant. Group the tabs into logical categories.

      User request: "${prompt}"

      Available tabs:
      ${tabsInfo}

      Return a JSON response with:
      - action: "organize_tabs"
      - output: { tabs: [{ group_name: "category", tabs: [{ title, url, description }, ...] }, ...] }
      - confidence: a number between 0 and 1

      Return ONLY valid JSON. No additional text.
    `.trim();
    break;

  case "generate_tabs":
    query = `
      You are a tab generation assistant. Create a list of useful tabs/URLs based on the user's request.

      User request: "${prompt}"

      Return a JSON response with:
      - action: "generate_tabs"
      - output: { group_name: "descriptive name", tabs: [{ title: "page title", url: "full url", description: "what it's for" }, ...] }
      - confidence: a number between 0 and 1

      Generate 5–10 relevant, high-quality URLs. Return ONLY valid JSON. No additional text.
    `.trim();
    break;

  // === BOOKMARK INTENTS ===
  case "remove_bookmarks":
    query = `
      You are a Chrome assistant managing the user's bookmarks.

      Here is the user's full bookmark tree in JSON:
      ${bookmark_tree}

      The user said: "${prompt}"

      Your task:
      - Identify ONLY the bookmarks (not folders) the user explicitly asked to remove.
      - Do NOT invent bookmarks that aren't in the tree.
      - If nothing matches, return an empty list [].

      Return ONLY valid JSON in this format:
      { "action": "remove_bookmarks", "output": { "bookmarks": [...] }, "confidence": 0.X }
    `.trim();
    break;

  case "search_bookmarks":
    query = `
      You are a Chrome assistant managing the user's bookmarks.

      Here is the user's full bookmark tree in JSON:
      ${bookmark_tree}

      The user said: "${prompt}"

      Your task:
      - Look through the provided bookmarks, and return only ONE that best matches their description.

      Return ONLY valid JSON in this format:
      { "action": "search_bookmarks", "output": { "bookmarks": [...] }, "confidence": 0.X }
    `.trim();
    break;

  case "organize_bookmarks":
  query = `
  You are an intelligent Chrome bookmark organizer.

  User request:
  ${prompt}

  You are given:
  - Open tabs: ${tabsInfo}
  - Existing bookmarks (as tree): ${bookmark_tree}

  What you must do:
  - Reorganize bookmarks by suggesting which existing folder each bookmark should move to.
  - If user requests, add tabs as bookmarks under existing folders.
  - Use only existing folders (do NOT invent new ones unless the user explicitly asks).
  - Do NOT return the full bookmark tree — just a list of bookmarks and their target folders.
  - Bookmarks just under the bookmarks bar, mobile bookmarks or other bookmarks but not directly inside another folder count as unorganized

  Return ONLY valid JSON in this format:
  {
    "action": "organize_bookmarks",
    "output": {
      "reorganized_bookmarks": [
        { "id": "bookmark_id", "move_to_folder": "folder_title" }
      ],
      "tabs_to_add": [
        { "tab_title": "example", "tab_url": "url", "folder_title": "folder" }
      ]
    },
    "confidence": 0.X
  }
  `.trim();
  break;


  default:
    console.warn("Unknown intent:", intent);
    return null;
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


export async function generateAISuggestion() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "WRITER_SUGGESTION" }, (resp) => {
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        if (!resp || !resp.result) {
          console.warn("Writer API failed or unavailable.");
          resolve(null);
          return;
        }

        console.log("[Writer] Generated suggestion:", resp.result);

        const suggestion = resp.result.trim();
        const formatted = suggestion.charAt(0).toLowerCase() + suggestion.slice(1);
        const res = "Ask Tabi to... " + formatted;

        resolve(res);
      });
    });
  } catch (err) {
    console.error("[Writer] Error generating suggestion:", err);
    return null;
  }
}

export async function generateQueryAutocomplete(prefix) {
  try {
    if (!prefix || !prefix.trim()) {
      return null;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "WRITER_AUTOCOMPLETE", prefix },
        (resp) => {
          if (chrome.runtime.lastError) {
            console.error("[Writer] Autocomplete runtime error:", chrome.runtime.lastError.message);
            resolve(null);
            return;
          }

          if (!resp || typeof resp.result !== "string") {
            resolve(null);
            return;
          }

          resolve(resp.result.trim() || null);
        }
      );
    });
  } catch (err) {
    console.error("[Writer] Error generating autocomplete:", err);
    return null;
  }
}

export async function generateLoadingMessage(prompt, action) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "WRITER_LOADING_MESSAGE", prompt, action },
        (resp) => {
          if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError.message);
            resolve("Working on it...");
            return;
          }
          if (!resp || !resp.result) {
            console.warn("Writer API failed or unavailable.");
            resolve("Working on it...");
            return;
          }

          const msg = resp.result.trim();
          const formatted =
            msg.charAt(0).toUpperCase() + msg.slice(1).replace(/\.$/, "");
          resolve(formatted + "...");
        }
      );
    });
  } catch (err) {
    console.error("[Writer] Error generating loading message:", err);
    return "Working on it...";
  }
}
