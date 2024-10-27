// popup.js: Scripts for the popup window found in index.html



// Load the checkbox state when the popup opens
chrome.storage.local.get(['activate_estimate'], (result) => {
    document.getElementById('activate_estimate').checked = result.activate_estimate;
});



// Load the checkbox state when the popup opens
chrome.storage.local.get(['hide_bot_content'], (result) => {
    document.getElementById('hide_bot_content').checked = result.hide_bot_content;
});

  


// EventListener for slider that adds bot estimates to tweets
document.getElementById('activate_estimate').addEventListener('click', () => {
    // Send a message to the service worker
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Get the active tab
        const activeTab = tabs[0];  

        // Send message to service workers and background.js
        chrome.runtime.sendMessage({ message: 'activate_estimate', tab: activeTab, checked: document.getElementById('activate_estimate').checked });
    })
});


// EventListener for slider that hides tweets that are evaluated to be bot content
document.getElementById('hide_bot_content').addEventListener('click', () => {
    // Send a message to the service worker
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Get the active tab
        const activeTab = tabs[0];  

        // Send message to service workers and background.js
        chrome.runtime.sendMessage({ message: 'hide_bot_content', tab: activeTab, checked: document.getElementById('hide_bot_content').checked });
    })
});
