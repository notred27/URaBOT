importScripts("service_workers/service_worker_utils.js");

// Import scripts fot functionality on Twitter and Bluesky
importScripts("service_workers/bluesky_service_worker.js");
importScripts("service_workers/twitter_service_worker.js");


const API_ENDPOINT = 'http://127.0.0.1:5000/verify';


// Set the badge text to OFF when the extension is initially loaded
// Additionally set local variables when initially loaded
chrome.runtime.onInstalled.addListener(async () => {
    chrome.action.setBadgeText({
        text: "OFF",
    });

    chrome.storage.local.set({ 'activate_estimate': false })
    chrome.storage.local.set({ 'hide_bot_content': false })
    chrome.storage.local.set({ 'bot_threshold': 0.75 })
    chrome.storage.local.set({ process_tweets: { "test": 0 } });
    chrome.storage.local.set({ 'endpoint': API_ENDPOINT })
    chrome.storage.local.set({ 'api_endpoint': "localhost" })
});






/**
 * Listener that receives a message from the getEstimates function (which sends updated data)
 * and processes HTML to be injected for newly received tweets.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'update_tweets') {

        chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
            // Get the active tab
            const activeTab = tabs[0];

            // Check for valid context 
            if (activeTab.url.startsWith(twitterURL)) {
                // Execute the HTML injection function for hiding bot content
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectTwitterDisclaimers,
                });

                // Execute the HTML injection function for adding tweet classifications
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectTwitterClassification,
                });

            } else if (activeTab.url.startsWith(bskyURL)) {
                // Execute the HTML injection function for hiding bot content
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectBskyDisclaimers,
                });

                // Execute the HTML injection function for adding tweet classifications
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: injectBskyClassification,
                });
            }
        })
    }
});

