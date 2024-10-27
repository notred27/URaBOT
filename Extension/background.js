// Base url for Twitter
const twitterURL = 'https://x.com/';




// Set the badge text to OFF when the extension is initially loaded
// Additionally set local variables to false
chrome.runtime.onInstalled.addListener(async () => {
    chrome.action.setBadgeText({
        text: "OFF",
    });

    chrome.storage.local.set({'activate_estimate': false})
    chrome.storage.local.set({'hide_bot_content': false})


    
});


/**
 * Function that receives a message from content.js, and wakes up the service worker to
 * execute the classification injection function.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {

    if (request.message === 'user_scrolled' && sender.tab.url.startsWith(twitterURL) ) {

        const activate_estimate = await chrome.storage.local.get(['activate_estimate']);

        if(activate_estimate.activate_estimate) {
            await chrome.scripting.executeScript({
                target: { tabId: sender.tab.id },
                func: injectClassification,
            });
        }

        
    }
});


// Listen to see if the show estimate slider (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'activate_estimate') {
        chrome.storage.local.set({'activate_estimate': request.checked})

        if(request.checked) {
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: injectClassification,
            });
        } else {
            // TODO: Create a clean-up function for the injected estimates
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: cleanupClassification,
            });
            
        }


        // Check if the extension should be active
        await toggleActive(request.tab.id);
    }
});


// Listen to see if the hide bot content slider (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'hide_bot_content') {
        chrome.storage.local.set({'hide_bot_content': request.checked})

        // Check if the extension should be active
        await toggleActive(request.tab.id);
    }
});


/**
 * Function that determines if the extension is currently active or not.
 * @returns Boolean (if the extension should be currently active)
 */
async function extensionIsActive() {
    const hide_bots = await chrome.storage.local.get(['hide_bot_content']);
    const activate_estimate = await chrome.storage.local.get(['activate_estimate']);

    return hide_bots.hide_bot_content || activate_estimate.activate_estimate;
}



// Function that changes both the badge text and injected css depending
async function toggleActive(tabId) {
    const isActive = await extensionIsActive();
    const nextState = isActive ? 'ON' : 'OFF';

    await chrome.action.setBadgeText({
        tabId: tabId,
        text: nextState,
    });


    // FIXME: Find a better way to inject this when the extension is activated
    if (nextState === "ON") {
        // Insert the CSS file when the user turns the extension on
        await chrome.scripting.insertCSS({
            files: ["rabotStyles.css"],
            target: { tabId: tabId},
        });

    } else if (nextState === "OFF") {
        // Remove the CSS file when the user turns the extension off
        await chrome.scripting.removeCSS({
            files: ["rabotStyles.css"],
            target: { tabId: tabId },
        });
    }
}


/**
 * Helper function that finds all currently loaded tweets, and assigns a classification.
 */
function injectClassification() {
    // Find all tweets that are currently loaded in the browser 
    document.querySelectorAll('[data-testid="tweet"]').forEach(tweet => {

        // Do not rerender tweet if it has already been assessed. 
        // IDEA: Maybe also keep list of tweets so you don't need to recompute on scroll back

        if (tweet.getElementsByClassName("rabot_check").length == 0) {
            // Scrape tweet data
            try {
                var handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
                var name = handle[0]

                handle = handle[1].split("·")

                var username = handle[0]
                var date = handle[handle.length - 1]   // Probably don't need this
                var tweetText = tweet.querySelector('[data-testid="tweetText"').textContent

                // TEMP: Log these metrics to the console for now
                console.log(name)
                console.log(username)
                console.log(date)
                console.log(tweetText)

            } catch (error) {   //TODO: Create a better handler for this
                console.log(error)
            }


            var percentage = Math.random(); //TODO: Assign the classification here


            // Create HTML to be injected into the tweet
            var innerDiv = document.createElement("div");
            innerDiv.className = "rabot_check";
            innerDiv.innerHTML = `<b>${(percentage * 100).toFixed(1)}%</b>`;

            // Set the color of the classification border depending on value
            if (percentage < 0.5) {
                innerDiv.style.border = `solid 5px rgb(${200 * percentage * 2}, 250, ${2 * percentage * 200})`;
            } else {
                innerDiv.style.border = `solid 5px rgb(250, ${220 - (percentage - 0.5) * 2 * 220}, ${220 - (percentage - 0.5) * 2 * 220})`;
            }

            // Add the classification to the tweet
            tweet.appendChild(innerDiv);
        }
    });
}



function cleanupClassification() {
    const elms = document.getElementsByClassName('rabot_check')

    while(elms.length > 0){
        elms[0].remove()
    }
}