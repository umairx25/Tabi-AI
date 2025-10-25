/*
content.js
Injects the extension UI into the current webpage/DOM. Responsible for all
script injection, including displaying and removing the overlay.
*/


(() => {
  if (window.__tabi_content_injected__) return;
  window.__tabi_content_injected__ = true;

  let overlayOpen = false;
  let overlayEl = null;
  let shadow = null;

  /** Creates the overlay injected into the DOM. */
  function createOverlay() {
    overlayEl = document.createElement("div");
    overlayEl.id = "tabi-overlay-host";
    overlayEl.style.cssText = [
      "position: fixed",
      "top: 47%",
      "left: 52%",
      "transform: translate(-50%, -50%)",
      "width: 600px",
      "height: 400px", 
      "z-index: 2147483647",
      "display: flex",
      "align-items: stretch",
      "justify-content: stretch",
      "pointer-events: none",
    ].join(";");

    // Remove overlay if mouse click detected outside
    overlayEl.addEventListener("mousedown", (e) => {
      if (e.target === overlayEl) {
        destroyOverlay();
      }
    });

    document.documentElement.appendChild(overlayEl);
    shadow = overlayEl.attachShadow({ mode: "open" });

    // Shadow DOM wrapper so transparent background can be achieved
    const wrapper = document.createElement("div");
    wrapper.style.cssText = [
      "all: initial",
      "position: relative",
      "width: 100%",
      "height: 100%",
      "pointer-events: auto",
      "border-radius: 0px",
      "overflow: hidden",
      "box-shadow: 0 12px 34px rgba(0,0,0,0.35)",
      "box-shadow: none",
      "background: transparent"
    ].join(";");

    // Close button
    const header = document.createElement("div");
    header.style.cssText = [
      "position: absolute",
      "top: 6px",
      "right: 6px",
      "z-index: 2",
      "display: flex",
      "gap: 6px"
    ].join(";");

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.style.cssText = [
      "all: initial",
      "cursor: pointer",
      "font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      "font-size: 16px",
      "line-height: 1",
      "padding: 6px 10px",
      "color: #eee",
      "background: #2b2b2b",
      "border-radius: 10px",
      "border: 1px solid #3a3a3a",
      "box-shadow: 0 1px 2px rgba(0,0,0,0.25)",
      "display: none"
    ].join(";");
    closeBtn.addEventListener("click", destroyOverlay);

    header.appendChild(closeBtn);
    wrapper.appendChild(header);

    // Iframe that loads extension UI
    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("popup.html");
    iframe.title = "tabi";

    iframe.style.cssText = [
      "position: absolute",
      "inset: 0",
      "width: 100%",
      "height: 100%",
      "border: 0",
      "background: transparent",
      "color-scheme: none",          // prevent dark reader theme injection
      "allowtransparency: true",     // important for iframe bg
    ].join(";");

    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("data-darkreader-ignore", "");


    wrapper.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow.postMessage({ type: "FOCUS_SEARCH" }, "*");
    };


    shadow.appendChild(wrapper);

    // Esc closes overlay
    window.addEventListener("keydown", escListener, true);

    // Click outside to close
    const backdrop = document.createElement("div");
    backdrop.style.cssText = [
      "position: fixed",
      "inset: 0",
      "pointer-events: auto",
      "background: transparent"
    ].join(";");

    // Close overlay if click detected outside
    backdrop.addEventListener("mousedown", () => {
      destroyOverlay();
    });

    document.documentElement.insertBefore(backdrop, overlayEl);
    overlayEl.__backdrop = backdrop;

    overlayOpen = true;
  }

  /** Destroy the currently mounted overlay and clean event listeners. */
  function destroyOverlay() {
    if (!overlayEl) return;
    window.removeEventListener("keydown", escListener, true);
    overlayEl.__backdrop?.remove();
    overlayEl.remove();
    overlayEl = null;
    shadow = null;
    overlayOpen = false;
  }

  /** Handle Escape key presses while the overlay is open. */
  function escListener(e) {
    if (e.key === "Escape") {
      destroyOverlay();
      e.stopPropagation();
    }
  }

  /** Toggle the overlay visibility based on its current state. */
  function toggleOverlay() {
    if (overlayOpen) destroyOverlay();
    else createOverlay();
  }

  // Message from background.js to toggle
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "tabi_TOGGLE") {
      toggleOverlay();
    }
  });


// === LanguageModel bridge ===
// let __lmSession = null;

// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   // Always return true immediately to keep the message port open
//   if (msg.type !== "GET_INTENT") return;
//   (async () => {
//     try {
//       // Ensure LanguageModel API exists
//       if (typeof LanguageModel === "undefined" || !LanguageModel.create) {
//         console.warn("[LM] LanguageModel not available");
//         sendResponse({ result: null });
//         return;
//       }

//       // Reuse an existing session or create a new one
//       if (!__lmSession) {
//         console.log("[LM] Creating new LanguageModel session...");
//         __lmSession = await LanguageModel.create();
//       }

//       const schema = {
//         type: "string",
//         enum: ["search_tabs", "generate_tabs", "organize_tabs", "close_tabs"],
//       };

//       const query = `
//       Categorize the user's intent into one of: search_tabs, generate_tabs, organize_tabs, close_tabs.
//       Return ONLY the label. Nothing else.
//       User: "${msg.prompt}"
//       `;

//       const result = await __lmSession.prompt(query, { responseConstraint: schema });
//       const intent = (result || "").trim();

//       console.log("[LM] Model returned intent:", intent);
//       sendResponse({ result: intent.length ? intent : null });
//     } catch (err) {
//       console.error("[LM] Error running model:", err);
//       __lmSession = null;
//       sendResponse({ result: null });
//     }
//   })();

//   // Keep the channel open for async response
//   return true;
// });

// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg.type === "PROCESS_WITH_SCHEMA") {
//     (async () => {
//       try {
//         if (typeof LanguageModel === "undefined" || !LanguageModel.create) {
//           console.warn("[LM] LanguageModel not available");
//           sendResponse({ result: null });
//           return;
//         }

//         if (!__lmSession) {
//           console.log("[LM] Creating new LanguageModel session...");
//           __lmSession = await LanguageModel.create();
//         }

//         const result = await __lmSession.prompt(msg.prompt, { 
//           responseConstraint: msg.schema 
//         });

//         console.log("[LM] Model returned structured result:", result);
//         sendResponse({ result: result || null });
//       } catch (err) {
//         console.error("[LM] Error running model:", err);
//         __lmSession = null;
//         sendResponse({ result: null });
//       }
//     })();
    
//     return true; // Keep channel open
//   }
  
//   // ... rest of your existing handlers
// });

  // === LanguageModel bridge ===
  let __lmSession = null;

  /** Handle messages that rely on the Chrome Prompt API session. */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Handle GET_INTENT messages
    if (msg.type === "GET_INTENT") {
      (async () => {
        try {
          // Ensure LanguageModel API exists
          if (typeof LanguageModel === "undefined" || !LanguageModel.create) {
            console.warn("[LM] LanguageModel not available");
            sendResponse({ result: null });
            return;
          }

          // Reuse an existing session or create a new one
          if (!__lmSession) {
            console.log("[LM] Creating new LanguageModel session...");
            __lmSession = await LanguageModel.create();
          }

          const schema = {
            type: "string",
            enum: ["search_tabs", "generate_tabs", "organize_tabs", "close_tabs"],
          };

          const query = `
          Categorize the user's intent into one of: search_tabs, generate_tabs, organize_tabs, close_tabs.
          Return ONLY the label. Nothing else.
          User: "${msg.prompt}"
          `;

          const result = await __lmSession.prompt(query, { responseConstraint: schema });
          const intent = (result || "").trim();

          console.log("[LM] Model returned intent:", intent);
          sendResponse({ result: intent.length ? intent : null });
        } catch (err) {
          console.error("[LM] Error running model:", err);
          __lmSession = null;
          sendResponse({ result: null });
        }
      })();

      return true; // Keep the channel open for async response
    }

    // Handle PROCESS_WITH_SCHEMA messages
    if (msg.type === "PROCESS_WITH_SCHEMA") {
      (async () => {
        try {
          if (typeof LanguageModel === "undefined" || !LanguageModel.create) {
            console.warn("[LM] LanguageModel not available");
            sendResponse({ result: null });
            return;
          }

          if (!__lmSession) {
            console.log("[LM] Creating new LanguageModel session...");
            __lmSession = await LanguageModel.create();
          }

          const result = await __lmSession.prompt(msg.prompt, {
            responseConstraint: msg.schema
          });

          console.log("[LM] Model returned structured result:", result);
          sendResponse({ result: result || null });
        } catch (err) {
          console.error("[LM] Error running model:", err);
          __lmSession = null;
          sendResponse({ result: null });
        }
      })();

      return true; // Keep channel open
    }

    // For any other message types, don't handle them here
    return false;
  });



  window.__tabi_toggle__ = toggleOverlay;
})();