// VS Code Webview Main JavaScript

(function() {
    // Get VS Code API
    const vscode = acquireVsCodeApi();
    
    // UI Elements
    const chatTab = document.getElementById('chatTab');
    const editTab = document.getElementById('editTab');
    const chatView = document.getElementById('chatView');
    const editView = document.getElementById('editView');
    const currentFileDisplay = document.getElementById('currentFile');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatHistory = document.getElementById('chatHistory');
    const editHistory = document.getElementById('editHistory'); 
    const editInstructionInput = document.getElementById('editInstruction');
    const sendEditBtn = document.getElementById('sendEditBtn');
    const diffView = document.getElementById('diffView');
    const acceptEditBtn = document.getElementById('acceptEditBtn');
    const rejectEditBtn = document.getElementById('rejectEditBtn');
    const editFormView = document.getElementById('editFormView');
    const editDiffView = document.getElementById('editDiffView');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // State
    let isLoading = false;
    let activeTab = 'chat';
    let originalCode = '';
    let editedCode = '';
    // Add a global variable for the active request timeout
    let activeTimeout = null;
    
    // Initialize UI
    function init() {
        // Set up tab switching
        chatTab.addEventListener('click', () => switchTab('chat'));
        editTab.addEventListener('click', () => switchTab('edit'));
        
        // Set up chat form
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        sendChatBtn.addEventListener('click', sendChatMessage);
        
        // Set up edit form
        editInstructionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isLoading) {
                    return; // Prevent sending a new request while waiting for the AI response.
                }
                sendEditRequest();
            }
        });
        sendEditBtn.addEventListener('click', sendEditRequest);
        
        // Set up edit actions
        acceptEditBtn.addEventListener('click', acceptEdit);
        rejectEditBtn.addEventListener('click', rejectEdit);
        
        // Set up file picker buttons
        document.querySelectorAll('.file-picker-btn').forEach(btn => {
            btn.addEventListener('click', openFilePicker);
        });
        
        // Add event listener for the reset context button
        const resetContextBtn = document.getElementById('resetContextBtn');
        if (resetContextBtn) {
            resetContextBtn.addEventListener('click', resetContext);
        }
    }
    
    // Switch between tabs
    function switchTab(tab) {
        activeTab = tab;
        
        // Update active tab UI
        if (tab === 'chat') {
            chatTab.classList.add('active');
            editTab.classList.remove('active');
            chatView.style.display = 'flex';
            editView.style.display = 'none';
        } else {
            chatTab.classList.remove('active');
            editTab.classList.add('active');
            chatView.style.display = 'none';
            editView.style.display = 'flex';
        }
    }
    
    // Send a chat message
    function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || isLoading) return;
        
        // Make sure we have a spinner in the send button
        if (!sendChatBtn.querySelector('.btn-spinner')) {
            const btnSpinner = document.createElement('div');
            btnSpinner.className = 'btn-spinner';
            btnSpinner.style.display = 'none';
            sendChatBtn.appendChild(btnSpinner);
        }
        
        // Add user message to chat
        addMessage('user', text);
        
        // Clear input and set loading state
        chatInput.value = '';
        setLoading(true);
        
        // Send to extension
        vscode.postMessage({
            command: 'askQuestion',
            text: text
        });
        
        // Start a 60-second timeout for the chat request
        activeTimeout = setTimeout(() => {
            console.log("Chat request timed out after 60 seconds.");
            setLoading(false);
        }, 60000);
    }
    
    // Send an edit request
    function sendEditRequest() {
        const instruction = editInstructionInput.value.trim();
        if (!instruction || isLoading) return;
        
        // Set loading flag to prevent further submissions via [Enter]
        isLoading = true;
        
        // Disable only the Generate button in the edit tab
        sendEditBtn.disabled = true;
        const btnSpinner = sendEditBtn.querySelector('.btn-spinner');
        const btnText = sendEditBtn.querySelector('span');
        if (btnSpinner && btnText) {
            btnText.style.visibility = 'hidden';
            btnSpinner.style.display = 'block';
        }
        
        // Do not clear or hide edit history messages; skip showing the global loading indicator
        
        // Send edit request to extension
        vscode.postMessage({
            command: 'requestEdit',
            text: instruction
        });
        
        // Start a 60-second timeout for the edit request
        activeTimeout = setTimeout(() => {
            console.log("Edit request timed out after 60 seconds.");
            setLoading(false);
        }, 60000);
    }
    
    // Accept the proposed edit
    function acceptEdit() {
        vscode.postMessage({
            command: 'acceptEdit',
            text: editedCode
        });
    }
    
    // Reject the proposed edit
    function rejectEdit() {
        vscode.postMessage({
            command: 'rejectEdit'
        });
    }
    
    // Open VS Code's native file picker (Cmd+P)
    function openFilePicker() {
        vscode.postMessage({
            command: 'openFilePicker'
        });
    }
    
    // Add a message to the chat history
    function addMessage(role, text) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${role}`;
        
        try {
            // Remove the empty-state div if it exists (first message)
            const emptyState = chatHistory.querySelector('.empty-state');
            if (emptyState) {
                chatHistory.removeChild(emptyState);
            }
            
            // Create message content wrapper
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            messageEl.appendChild(contentEl);
            
            // Use marked.js to render markdown if available
            if (window.marked && typeof window.marked.parse === 'function') {
                // Try to parse the markdown
                try {
                    contentEl.innerHTML = window.marked.parse(text);
                    
                    // Add copy buttons to code blocks
                    const codeBlocks = contentEl.querySelectorAll('pre code');
                    codeBlocks.forEach((codeBlock, index) => {
                        const container = codeBlock.parentElement;
                        if (container) {
                            const copyBtn = document.createElement('button');
                            copyBtn.className = 'copy-btn';
                            copyBtn.textContent = 'Copy';
                            copyBtn.title = 'Copy code';
                            copyBtn.dataset.index = index.toString();
                            
                            copyBtn.addEventListener('click', () => {
                                const codeText = codeBlock.textContent || '';
                                navigator.clipboard.writeText(codeText)
                                    .then(() => {
                                        copyBtn.textContent = 'Copied!';
                                        setTimeout(() => {
                                            copyBtn.textContent = 'Copy';
                                        }, 2000);
                                    })
                                    .catch(err => {
                                        console.error('Error copying text: ', err);
                                    });
                            });
                            
                            container.style.position = 'relative';
                            container.appendChild(copyBtn);
                        }
                    });
                } catch (markdownError) {
                    console.error('Error parsing markdown:', markdownError);
                    messageEl.textContent = text;
                }
            } else {
                // Fallback if marked is not available
                messageEl.textContent = text;
            }
        } catch (error) {
            console.error('Error adding message:', error);
            // Last resort fallback
            messageEl.textContent = text || 'Error displaying message content';
        }
        
        // Make sure the message gets added and the view scrolls, regardless of any rendering errors
        chatHistory.appendChild(messageEl);
        
        // Ensure proper scrolling behavior
        setTimeout(() => {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }, 10);
        
        // For debugging
        console.log(`Added ${role} message:`, text ? text.substring(0, 100) + '...' : 'empty');
        
        // Persist chat history state
        vscode.postMessage({
            command: 'persistMessages',
            chat: chatHistory.innerHTML,
            edit: editHistory.innerHTML
        });
    }
    
    // Format a diff view of the code changes
    function formatDiff(original, edited) {
        if (!original || !edited) return edited || '';
        
        const originalLines = original.split('\n');
        const editedLines = edited.split('\n');
        
        let diffHtml = '';
        
        // Maximum number of lines to compare
        const maxLines = Math.max(originalLines.length, editedLines.length);
        
        for (let i = 0; i < maxLines; i++) {
            const originalLine = i < originalLines.length ? originalLines[i] : '';
            const editedLine = i < editedLines.length ? editedLines[i] : '';
            
            if (originalLine !== editedLine) {
                if (i < originalLines.length) {
                    diffHtml += `<div class="diff-line removed">- ${escapeHtml(originalLine)}</div>`;
                }
                if (i < editedLines.length) {
                    diffHtml += `<div class="diff-line added">+ ${escapeHtml(editedLine)}</div>`;
                }
            } else {
                diffHtml += `<div class="diff-line">&nbsp;&nbsp;${escapeHtml(editedLine)}</div>`;
            }
        }
        
        return diffHtml;
    }
    
    // Escape HTML to prevent issues with injected HTML
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // Add a message to the edit history
    function addEditMessage(role, text) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${role}`;
        
        try {
            // Remove the empty-state div if it exists (first message)
            const emptyState = editHistory.querySelector('.empty-state');
            if (emptyState) {
                editHistory.removeChild(emptyState);
            }
            
            // Create message content wrapper
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            messageEl.appendChild(contentEl);
            
            // Use marked.js to render markdown if available
            if (window.marked && typeof window.marked.parse === 'function') {
                // Try to parse the markdown
                try {
                    contentEl.innerHTML = window.marked.parse(text);
                } catch (markdownError) {
                    console.error('Error parsing markdown:', markdownError);
                    messageEl.textContent = text;
                }
            } else {
                // Fallback if marked is not available
                messageEl.textContent = text;
            }
        } catch (error) {
            console.error('Error adding message:', error);
            // Last resort fallback
            messageEl.textContent = text || 'Error displaying message content';
        }
        
        // Make sure the message gets added and the view scrolls
        editHistory.appendChild(messageEl);
        
        // Ensure proper scrolling behavior
        setTimeout(() => {
            editHistory.scrollTop = editHistory.scrollHeight;
        }, 10);
        
        // Persist edit history state
        vscode.postMessage({
            command: 'persistMessages',
            chat: chatHistory.innerHTML,
            edit: editHistory.innerHTML
        });
    }
    
    // Display an error message in the edit tab
    function displayEditError(message) {
        // Display the error message in the edit history
        addEditMessage('error', message);
        
        // Switch to edit tab if not already there
        if (activeTab !== 'edit') {
            switchTab('edit');
        }
        
        // Hide loading indicator if it's showing
        loadingIndicator.style.display = 'none';
        
        // Show the form view if diff view is showing
        if (editDiffView.style.display !== 'none') {
            editDiffView.style.display = 'none';
            editFormView.style.display = 'block';
        }
    }
    
    // Set loading state
    function setLoading(loading) {
        isLoading = loading;
        // If setting to false, clear any active timeout
        if (!loading && activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }
        
        if (loading) {
            // Disable buttons
            sendChatBtn.disabled = true;
            sendEditBtn.disabled = true;
            
            if (activeTab === 'chat') {
                // Show spinner in chat send button
                const btnSpinner = sendChatBtn.querySelector('.btn-spinner');
                const btnText = sendChatBtn.querySelector('span');
                if (btnSpinner && btnText) {
                    btnText.style.visibility = 'hidden';
                    btnSpinner.style.display = 'block';
                }
            } else {
                // Show spinner in edit send button
                const btnSpinner = sendEditBtn.querySelector('.btn-spinner');
                const btnText = sendEditBtn.querySelector('span');
                if (btnSpinner && btnText) {
                    btnText.style.visibility = 'hidden';
                    btnSpinner.style.display = 'block';
                }
            }
        } else {
            // Enable buttons
            sendChatBtn.disabled = false;
            sendEditBtn.disabled = false;
            
            // Hide spinner in chat send button
            const chatBtnSpinner = sendChatBtn.querySelector('.btn-spinner');
            const chatBtnText = sendChatBtn.querySelector('span');
            if (chatBtnSpinner && chatBtnText) {
                chatBtnText.style.visibility = 'visible';
                chatBtnSpinner.style.display = 'none';
            }
            
            // Hide spinner in edit send button
            const editBtnSpinner = sendEditBtn.querySelector('.btn-spinner');
            const editBtnText = sendEditBtn.querySelector('span');
            if (editBtnSpinner && editBtnText) {
                editBtnText.style.visibility = 'visible';
                editBtnSpinner.style.display = 'none';
            }
            
            // Hide edit loading indicator
            loadingIndicator.style.display = 'none';
        }
    }
    
    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateCurrentFile':
                currentFileDisplay.textContent = message.text;
                break;
                
            // New case: record the edit request as a user-style chat bubble (aligned right)
            case 'recordEditRequest':
                addEditMessage('user', message.text);
                break;
                
            case 'displayResponse':
                addMessage('ai', message.text);
                setLoading(false);
                break;
                
            case 'displayEditError':
                displayEditError(message.text);
                setLoading(false);
                break;
                
            case 'displayEditProposal':
                // Store the codes for later use
                originalCode = message.originalCode;
                editedCode = message.text;
                
                // Update the diff view with a diff of original vs. edited code
                diffView.innerHTML = formatDiff(originalCode, editedCode);
                
                // Hide the edit instruction form and show the diff view for review  
                editFormView.style.display = 'none';
                editDiffView.style.display = 'flex';
                editInstructionInput.value = '';
                setLoading(false);
                break;
                
            case 'editAccepted':
                // Reset state and view
                originalCode = '';
                editedCode = '';
                
                // Add success message to edit history
                addEditMessage('system', 'Changes applied successfully.');
                
                // Show form view
                editDiffView.style.display = 'none';
                editFormView.style.display = 'block';
                break;
                
            case 'editRejected':
                // Reset state and view
                originalCode = '';
                editedCode = '';
                
                // Add info message to edit history
                addEditMessage('system', 'Changes discarded.');
                
                // Show form view
                editDiffView.style.display = 'none';
                editFormView.style.display = 'block';
                break;
        }
    });
    
    // Function to reset chat and edit context, clearing all messages
    function resetContext() {
        // Stop any active request.
        isLoading = false;
        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }
        sendChatBtn.disabled = false;
        sendEditBtn.disabled = false;
        const chatBtnSpinner = sendChatBtn.querySelector('.btn-spinner');
        const chatBtnText = sendChatBtn.querySelector('span');
        if (chatBtnSpinner && chatBtnText) {
            chatBtnSpinner.style.display = 'none';
            chatBtnText.style.visibility = 'visible';
        }
        const editBtnSpinner = sendEditBtn.querySelector('.btn-spinner');
        const editBtnText = sendEditBtn.querySelector('span');
        if (editBtnSpinner && editBtnText) {
            editBtnSpinner.style.display = 'none';
            editBtnText.style.visibility = 'visible';
        }
        
        // Clear chat and edit histories from the UI.
        if (chatHistory) {
            chatHistory.innerHTML = '<div class="empty-state"><p>Context reset. Start a new conversation.</p></div>';
        }
        if (editHistory) {
            editHistory.innerHTML = '<div class="empty-state"><p>Describe how you want to edit the current file</p></div>';
        }
        
        // Persist the cleared state in both the webview state and the extension's globalState.
        vscode.setState({ chat: chatHistory.innerHTML, edit: editHistory.innerHTML });
        vscode.postMessage({ command: 'persistMessages', chat: chatHistory.innerHTML, edit: editHistory.innerHTML });
        
        console.log("Active request stopped. Chat and edit context cleared.");
    }
    
    // Initialize once DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        init();
        // Initialize histories from injected state if available.
        if (window.initialChatState) {
            chatHistory.innerHTML = window.initialChatState;
        }
        if (window.initialEditState) {
            editHistory.innerHTML = window.initialEditState;
        }
    });
    
    // If already loaded, initialize now
    if (document.readyState === 'complete') {
        init();
    }
})();
