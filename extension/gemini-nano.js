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
        // console.log("Intent from local model:", resp.result);
        resolve(resp.result);
      });
    });
  } catch (err) {
    console.error("getIntent() failed:", err);
    return null;
  }
}


export async function executeIntent(intent, prompt, groupedTabs) {
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
