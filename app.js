let passphrase = "";
let bookmarks = [];
let showBookmarkActions = false; // New variable to track actions visibility

let emptyBookmark = {
  uid: "",
  label: "",
  token: "",
  clickCount: 0,
};

// Generate a unique ID
function generateUID() {
  return "bm_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// Extract domain from URL
function extractDomain(url) {
  try {
    // Add protocol if missing
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch (e) {
    // If URL parsing fails, try to extract domain manually
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    return match ? match[1] : url;
  }
}

// Check if URL is from Reddit
function isRedditUrl(url) {
  const domain = extractDomain(url).toLowerCase();
  const result =
    domain === "reddit.com" ||
    domain === "www.reddit.com" ||
    domain.endsWith(".reddit.com");
  console.log(
    `[isRedditUrl] URL: ${url}, Domain: ${domain}, Is Reddit: ${result}`,
  );
  return result;
}

// Generate Reddit preview image URL
function getRedditPreviewUrl(url) {
  const previewUrl = `http://192.168.178.19:3999/extract?url=${encodeURIComponent(url)}`;
  console.log(
    `[getRedditPreviewUrl] Original URL: ${url}, Preview URL: ${previewUrl}`,
  );
  return previewUrl;
}

// Generate background color based on first two letters
function getColorForLetters(letters) {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FCEA2B",
    "#FF9F43",
    "#EE5A52",
    "#0FB9B1",
    "#3742FA",
    "#2F3542",
    "#FF3838",
    "#FF9500",
    "#FFD32A",
    "#8CC152",
    "#37BC9B",
    "#3F51B5",
    "#9C27B0",
    "#E91E63",
    "#F44336",
    "#FF5722",
    "#795548",
    "#607D8B",
    "#9E9E9E",
    "#FFC107",
    "#CDDC39",
    "#4CAF50",
  ];

  // Create a hash from the first two letters
  let hash = 0;
  for (let i = 0; i < letters.length; i++) {
    const char = letters.toLowerCase().charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const index = Math.abs(hash) % colors.length;
  return colors[index] || "#0F766E";
}

// Create chips for words in a label
function createLabelChips(label, themeColor) {
  const words = label.split(" ").filter((word) => word.trim() !== "");

  return words
    .map((word) => {
      // Replace dots with spaces in the chip text
      const chipText = word.replace(/\./g, " ");
      return `<span class="word-chip" style="--theme-color: ${themeColor};">${chipText}</span>`;
    })
    .join(" ");
}

// Decrypt individual bookmarks for display
async function decryptBookmarks(encryptedBookmarks, passphrase) {
  const decryptedBookmarks = [];
  for (const bookmark of encryptedBookmarks) {
    try {
      const decryptedLabel = await decrypt(bookmark.encryptedLabel, passphrase);
      const encryptedToken = bookmark.encryptedToken || bookmark.encryptedUrl;
      const decryptedToken = await decrypt(encryptedToken, passphrase);

      decryptedBookmarks.push({
        uid: bookmark.uid,
        label: decryptedLabel,
        token: decryptedToken,
        clickCount: bookmark.clickCount || 0,
      });
    } catch (error) {
      console.error("Failed to decrypt bookmark:", error);
      // Skip corrupted bookmarks
    }
  }
  return decryptedBookmarks;
}

// Create token tile HTML
function createDomainTile(seedText) {
  const normalizedSeed = (seedText || "TK").replace(/\s+/g, "");
  const firstLetter = (normalizedSeed.charAt(0) || "T").toUpperCase();
  const secondLetter = normalizedSeed.charAt(1)
    ? normalizedSeed.charAt(1).toLowerCase()
    : "k";
  const twoLetters = firstLetter + secondLetter;
  const backgroundColor = getColorForLetters(twoLetters);

  return `<div class="domain-tile" style="background-color: ${backgroundColor};">
    <span style="font-size: 14px; line-height: 1;">${firstLetter}</span>
    <span style="font-size: 10px; font-variant: small-caps; line-height: 1;">${secondLetter}</span>
  </div>`;
}

// Convert string to ArrayBuffer
function stringToArrayBuffer(str) {
  return new TextEncoder().encode(str);
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer) {
  return new TextDecoder().decode(buffer);
}

// Derive key from passphrase using PBKDF2
async function deriveKey(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// Encrypt data using AES-GCM
async function encrypt(data, pass) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);

    const encodedData = stringToArrayBuffer(JSON.stringify(data));
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encodedData,
    );

    // Combine salt, iv, and encrypted data
    const combined = new Uint8Array(
      salt.length + iv.length + encryptedData.byteLength,
    );
    combined.set(salt);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedData), salt.length + iv.length);

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption error:", error);
    return null;
  }
}

// Decrypt data using AES-GCM
async function decrypt(encryptedData, pass) {
  try {
    // Convert from base64
    const combined = new Uint8Array(
      atob(encryptedData)
        .split("")
        .map((char) => char.charCodeAt(0)),
    );

    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    const key = await deriveKey(pass, salt);
    const decryptedData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encrypted,
    );

    const decryptedString = arrayBufferToString(decryptedData);
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

async function unlock() {
  passphrase = document.getElementById("code").value;
  if (!passphrase || passphrase.length !== 6) {
    alert("Please enter a 6-digit code.");
    return;
  }
  let stored = localStorage.getItem("bookmarks");
  if (stored) {
    try {
      const encryptedBookmarks = JSON.parse(stored);
      // Decrypt bookmarks for display
      bookmarks = await decryptBookmarks(encryptedBookmarks, passphrase);

      console.log("Bookmakrs", bookmarks, encryptedBookmarks);
    } catch (error) {
      console.error("Error processing bookmarks:", error);
      alert("Wrong code or corrupted data!");
      return;
    }
  } else {
    bookmarks = [];
  }
  sessionStorage.setItem("passphrase", passphrase); // Store passphrase in session
  document.getElementById("code").value = ""; // Clear the passcode field
  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
  render();
}

async function autoUnlock() {
  let savedPassphrase = sessionStorage.getItem("passphrase");
  if (savedPassphrase) {
    passphrase = savedPassphrase;
    let stored = localStorage.getItem("bookmarks");
    if (stored) {
      try {
        const encryptedBookmarks = JSON.parse(stored);
        // Decrypt bookmarks for display
        bookmarks = await decryptBookmarks(encryptedBookmarks, passphrase);
      } catch (error) {
        console.error("Error processing bookmarks:", error);
        sessionStorage.removeItem("passphrase");
        return;
      }
    } else {
      bookmarks = [];
    }
    document.getElementById("login").style.display = "none";
    document.getElementById("app").style.display = "block";
    render();
  }
}

function lock() {
  passphrase = "";
  bookmarks = [];
  sessionStorage.removeItem("passphrase");
  // Perform a full page reload to ensure clean state
  location.reload();
}

// Save bookmarks in encrypted format
async function saveBookmarks() {
  const encryptedBookmarks = [];
  for (const bookmark of bookmarks) {
    const encryptedLabel = await encrypt(bookmark.label, passphrase);
    const encryptedToken = await encrypt(bookmark.token, passphrase);

    encryptedBookmarks.push({
      uid: bookmark.uid,
      encryptedLabel: encryptedLabel,
      encryptedToken: encryptedToken,
      clickCount: bookmark.clickCount,
    });
  }
  localStorage.setItem("bookmarks", JSON.stringify(encryptedBookmarks));
}

async function addBookmark() {
  let key = document.getElementById("key").value.trim();
  let value = document.getElementById("value").value.trim();
  if (key && value) {
    const newBookmark = {
      uid: generateUID(),
      label: key,
      token: value,
      clickCount: 0,
    };
    bookmarks.push(newBookmark);
    await saveBookmarks();
    document.getElementById("key").value = "";
    document.getElementById("value").value = "";
    render();
  }
}

function render() {
  let container = document.getElementById("bookmarks");
  container.innerHTML = "";

  if (bookmarks.length === 0) {
    let emptyDiv = document.createElement("div");
    emptyDiv.style.textAlign = "center";
    emptyDiv.style.color = "#475569";
    emptyDiv.style.fontStyle = "italic";
    emptyDiv.style.padding = "20px";
    emptyDiv.textContent = "No tokens stored";
    container.appendChild(emptyDiv);
  } else {
    // Sort bookmarks by click count (highest first)
    const sortedBookmarks = [...bookmarks].sort(
      (a, b) => b.clickCount - a.clickCount,
    );

    sortedBookmarks.forEach((bookmark) => {
      let div = document.createElement("div");
      div.className = "bookmark";

      const tokenTile = createDomainTile(bookmark.label || bookmark.token);
      const cleanId = bookmark.uid.replace(/[^a-zA-Z0-9]/g, "");

      // Get the theme color for this token
      const tokenSeed = (bookmark.label || bookmark.token || "TK").replace(
        /\s+/g,
        "",
      );
      const firstLetter = (tokenSeed.charAt(0) || "T").toUpperCase();
      const secondLetter = tokenSeed.charAt(1)
        ? tokenSeed.charAt(1).toLowerCase()
        : "";
      const twoLetters = firstLetter + secondLetter;
      const themeColor = getColorForLetters(twoLetters);

      // Create chips for the label
      const labelChips = createLabelChips(bookmark.label, themeColor);

      div.innerHTML = `
      <strong>
        <div class="bookmark-header" onclick="copyToClipboard('${
          bookmark.token
        }', '${bookmark.uid}')">
          ${tokenTile}<span>${labelChips} <small style="color: #475569;">(${bookmark.clickCount})</small></span>
        </div>
        <button class="copy-icon-btn" onclick="copyToClipboard('${
          bookmark.token
        }', '${bookmark.uid}')" title="Copy Token">
          <svg class="copy-icon" viewBox="0 0 24 24">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
        </button>
      </strong>
      ${
        showBookmarkActions
          ? `<a href="#" onclick="toggleTokenVisibility('${cleanId}', '${bookmark.token}'); return false;" class="url-hidden" id="token-${cleanId}">[Click to view token]</a>`
          : ""
      }
      ${
        showBookmarkActions
          ? `<div class="bookmark-actions">
        <a class="toggle-link" onclick="editBookmarkLabel('${bookmark.uid}')">Edit Label</a>
        <a class="delete-link" onclick="deleteBookmark('${bookmark.uid}')">Delete this item</a>
      </div>`
          : ""
      }
    `;
      container.appendChild(div);
    });
  }
}

async function copyToClipboard(token, bookmarkUid) {
  navigator.clipboard
    .writeText(token)
    .then(async () => {
      // Find bookmark by UID and increment click count
      const bookmark = bookmarks.find((b) => b.uid === bookmarkUid);
      if (bookmark) {
        bookmark.clickCount += 1;

        // Save updated bookmarks
        await saveBookmarks();
      }

      // Show temporary confirmation message
      showCopyConfirmation();
    })
    .catch((err) => {
      alert("Failed to copy: " + err);
    });
}

function showCopyConfirmation() {
  // Create confirmation element
  const confirmation = document.createElement("div");
  confirmation.className = "copy-confirmation";
  confirmation.textContent = "Token copied to clipboard!";

  // Add to body
  document.body.appendChild(confirmation);

  // Remove after animation completes
  setTimeout(() => {
    if (confirmation.parentNode) {
      confirmation.parentNode.removeChild(confirmation);
    }
  }, 1500);
}

function clearData() {
  if (
    confirm(
      "Are you sure you want to clear all stored data? This action cannot be undone.",
    )
  ) {
    localStorage.removeItem("bookmarks");
    sessionStorage.removeItem("passphrase");
    alert("All data has been cleared.");
    document.getElementById("code").value = "";
    updatePlaceholder(); // Update placeholder after clearing data
  }
}

async function deleteBookmark(uid) {
  const bookmark = bookmarks.find((b) => b.uid === uid);
  if (
    bookmark &&
    confirm(`Are you sure you want to delete "${bookmark.label}"?`)
  ) {
    const index = bookmarks.findIndex((b) => b.uid === uid);
    if (index > -1) {
      bookmarks.splice(index, 1);
      await saveBookmarks();
      render();
    }
  }
}

async function editBookmarkLabel(uid) {
  const bookmark = bookmarks.find((b) => b.uid === uid);
  if (bookmark) {
    let newLabel = prompt(
      `Edit label for "${bookmark.label}":`,
      bookmark.label,
    );
    if (
      newLabel &&
      newLabel.trim() !== "" &&
      newLabel.trim() !== bookmark.label
    ) {
      newLabel = newLabel.trim();
      // Check if the new label already exists
      const existingBookmark = bookmarks.find(
        (b) => b.label === newLabel && b.uid !== uid,
      );
      if (existingBookmark) {
        alert("A token with this label already exists!");
        return;
      }
      // Update the label
      bookmark.label = newLabel;
      // Save the updated bookmarks
      await saveBookmarks();
      render();
    }
  }
}

function toggleTokenVisibility(cleanKey, token) {
  let urlElement = document.getElementById(`token-${cleanKey}`);

  if (urlElement.classList.contains("url-hidden")) {
    urlElement.innerHTML = `${token} <small style="color: #475569;">(Click to hide)</small>`;
    urlElement.classList.remove("url-hidden");
    urlElement.onclick = function (e) {
      e.preventDefault();
      toggleTokenVisibility(cleanKey, token);
      return false;
    };
  } else {
    urlElement.textContent = "[Token hidden - click to view]";
    urlElement.classList.add("url-hidden");
    urlElement.onclick = function (e) {
      e.preventDefault();
      toggleTokenVisibility(cleanKey, token);
      return false;
    };
  }
}

// Try to auto-unlock on load
autoUnlock();

// Update placeholder based on whether bookmarks exist
function updatePlaceholder() {
  const codeInput = document.getElementById("code");
  const hasBookmarks = localStorage.getItem("bookmarks");

  if (hasBookmarks) {
    codeInput.placeholder = "Enter code here";
  } else {
    codeInput.placeholder = "Register with code here";
  }
}

// Update placeholder on page load
updatePlaceholder();

// Export tokens as JSON file with encrypted values
function exportBookmarks() {
  const stored = localStorage.getItem("bookmarks");
  if (!stored || stored === "[]") {
    alert("No tokens to export!");
    return;
  }

  try {
    const encryptedBookmarks = JSON.parse(stored);
    const exportData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      tokens: encryptedBookmarks,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(dataBlob);
    link.download = `patsy-tokens-${
      new Date().toISOString().split("T")[0]
    }.json`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL object
    URL.revokeObjectURL(link.href);

    alert("Tokens exported successfully!");
  } catch (error) {
    console.error("Export error:", error);
    alert("Failed to export tokens!");
  }
}

// Import tokens from JSON file
function importBookmarks() {
  document.getElementById("import-file").click();
}

// Handle the selected import file
async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset the file input
  event.target.value = "";

  try {
    const fileContent = await file.text();
    const importData = JSON.parse(fileContent);

    const importedTokens = Array.isArray(importData.tokens)
      ? importData.tokens
      : importData.bookmarks;

    // Validate the import data structure
    if (!Array.isArray(importedTokens)) {
      alert("Invalid backup file format!");
      return;
    }

    // Validate that items have the expected encrypted structure
    const isValidFormat = importedTokens.every(
      (bookmark) =>
        bookmark.uid &&
        bookmark.encryptedLabel &&
        (bookmark.encryptedToken || bookmark.encryptedUrl),
    );

    if (!isValidFormat) {
      alert("Invalid token format in backup file!");
      return;
    }

    const normalizedBookmarks = importedTokens.map((bookmark) => ({
      uid: bookmark.uid,
      encryptedLabel: bookmark.encryptedLabel,
      encryptedToken: bookmark.encryptedToken || bookmark.encryptedUrl,
      clickCount:
        typeof bookmark.clickCount === "number" ? bookmark.clickCount : 0,
    }));

    // Ask user for confirmation
    const existingCount = JSON.parse(
      localStorage.getItem("bookmarks") || "[]",
    ).length;
    const importCount = importedTokens.length;

    let confirmMessage = `Import ${importCount} token(s)?`;
    if (existingCount > 0) {
      confirmMessage += `\n\nThis will replace your current ${existingCount} token(s).`;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    // Save the imported tokens
    localStorage.setItem("bookmarks", JSON.stringify(normalizedBookmarks));

    alert(
      `Successfully imported ${importCount} token(s)! Please unlock the app with the passcode to view the imported tokens.`,
    );
    lock();
  } catch (error) {
    console.error("Import error:", error);
    if (error instanceof SyntaxError) {
      alert("Invalid JSON file format!");
    } else {
      alert("Failed to import tokens!");
    }
  }
}

// Toggle bookmark actions visibility
function toggleBookmarkActions() {
  showBookmarkActions = !showBookmarkActions;
  const toggleIcon = document.getElementById("toggle-icon");
  toggleIcon.textContent = showBookmarkActions ? "✅" : "✏️";
  render(); // Re-render bookmarks with updated visibility
}
