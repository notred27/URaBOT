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

        // Execute the HTML injection function in real-time as new tweets are loaded
        await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: alterTweet,
        });
    }
});


// Listen to see if the show estimate slider (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'activate_estimate' && request.tab.url.startsWith(twitterURL)) {
        chrome.storage.local.set({'activate_estimate': request.checked})

        if(request.checked) {
            // Automatically injected estimates without need for scrolling
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: alterTweet,
            });

        } else {
            // Clean-up function for the injected estimates
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
    if (request.message === 'hide_bot_content' && request.tab.url.startsWith(twitterURL)) {
        chrome.storage.local.set({'hide_bot_content': request.checked})

        if(request.checked) {
            // Automatically injected estimates without need for scrolling
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: alterTweet,
            });

        } else {
            // TODO: Create Clean-up function to reverse hiding tweet content
            await chrome.scripting.executeScript({
                target: { tabId: request.tab.id },
                func: revertTweetRemoval,
            });
            
        }

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



// Function that changes both the badge text and injected css depending on if the extension is active
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
 * Helper function that finds all currently loaded tweets, and assigns a classification and/or hides its content
 */
async function alterTweet() {
    const hide_bots = await chrome.storage.local.get(['hide_bot_content']);
    const activate_estimate = await chrome.storage.local.get(['activate_estimate']);
    
    // Find all tweets that are currently loaded in the browser 
    document.querySelectorAll('[data-testid="tweet"]').forEach(tweet => {

        // Do not rerender tweet if it has already been assessed. 
        // IDEA: Maybe also keep list of tweets so you don't need to recompute on scroll back

        
        // TODO: Improve the efficiency of using these two boolean values
        if ((tweet.getElementsByClassName("rabot_check").length == 0 && activate_estimate.activate_estimate) || (tweet.getElementsByClassName("rabot_disclaimer").length == 0 && hide_bots.hide_bot_content)) {
            // Scrape tweet data
            try {
                var handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
                var name = handle[0]

                handle = handle[1].split("·")

                var username = handle[0]
                // var date = handle[handle.length - 1]   // Probably don't need this

                try {
                    var tweetText = tweet.querySelector('[data-testid="tweetText"').textContent
                } catch (error) {
                    var tweetText = ""
                }
                
                // TEMP: Log these metrics to the console for now
                // console.log(name)
                // console.log(username)
                // // console.log(date)
                // console.log(tweetText)

                const tweetForm = new FormData();
                tweetForm.append('username', username);
                tweetForm.append('display_name', name);
                tweetForm.append('tweet_content', tweetText);

                fetch("http://127.0.0.1:5000/verify", {
                    method: "POST",
                    body: tweetForm,
            
                })
                .then((response) => {
                    if(response["status"] == 200){  // Only continue if status is ok
                        return response.json();
                    }                       // TODO: Handel error codes here
                })
                .then((json) => {
                    console.log(json)
                    percent = json.percent  // TODO: Incorporate this response into the classification below
                
                });

                

            } catch (error) {   //TODO: Create a better handler for this
                console.log(error)
            }


            var percent = Math.random(); //TODO: Assign the classification here


            // FIXME: Find a way to make these helper functions and take them outside??
            // Create HTML to be injected into the tweet

            /**
             * Hide bot content
             */

            if(hide_bots.hide_bot_content) {
                // Get all divs from the base tweet
                const content = tweet.getElementsByTagName("div");

                // Hide all of the tweet's content
                for(let i = 0; i < content.length; i++) {
                    if(content[i] != null){
                        content[i].style.display = "none";
                    }
                }

                // Add disclaimer
                var disclaimerDiv = document.createElement("div");
                disclaimerDiv.className = "rabot_disclaimer";
                disclaimerDiv.innerHTML = `This tweet was likely created by a bot. `;

                var disclaimerLink = document.createElement("a");
                disclaimerLink.innerHTML = `Show Anyways...`;
                disclaimerDiv.appendChild(disclaimerLink);

                // Inject the HTML
                tweet.appendChild(disclaimerDiv);


                tweet.style.height = "200px"    // TEMP: Resize tweet for more reasonable functionality 

            }


            /**
             * Add bot classification
             */
            if(activate_estimate.activate_estimate){
                var classificationDiv = document.createElement("div");
                classificationDiv.className = "rabot_check";
                classificationDiv.innerHTML = `<b>${(percent * 100).toFixed(1)}%</b>`;

                // Set the color of the classification's border depending on value
                if (percent < 0.5) {
                    classificationDiv.style.border = `solid 5px rgb(${200 * percent * 2}, 250, ${2 * percent * 200})`;
                } else {
                    classificationDiv.style.border = `solid 5px rgb(250, ${220 - (percent - 0.5) * 2 * 220}, ${220 - (percent - 0.5) * 2 * 220})`;
                }

                // Inject the HTML
                tweet.appendChild(classificationDiv);
            }
        }
    });
}

// /**
//  * Create HTML content to represent the classification and inject it into the site
//  * @param {HTMLDivElement} tweet HTML that represents a tweet
//  * @param {Number} percent       Decimal representation of our bot classification. Higher == more likely to be a bot.
//  */
// function addEstimate(tweet, percent) {
//     // Create HTML to be injected into the tweet
//     var classificationDiv = document.createElement("div");
//     classificationDiv.className = "rabot_check";
//     classificationDiv.innerHTML = `<b>${(percent * 100).toFixed(1)}%</b>`;

//     // Set the color of the classification's border depending on value
//     if (percent < 0.5) {
//         classificationDiv.style.border = `solid 5px rgb(${200 * percent * 2}, 250, ${2 * percent * 200})`;
//     } else {
//         classificationDiv.style.border = `solid 5px rgb(250, ${220 - (percent - 0.5) * 2 * 220}, ${220 - (percent - 0.5) * 2 * 220})`;
//     }

//     // Inject the HTML
//     tweet.appendChild(classificationDiv);
// }

// /**
//  * Hide HTML content from tweets that are likely from bots
//  * @param {HTMLDivElement} tweet HTML that represents a tweet
//  * @param {Number} percent       Decimal representation of our bot classification. Higher == more likely to be a bot.
//  */
// function hideContent(tweet, percent) {
//     // Get all divs from the base tweet
//     const content = tweet.getElementsByTagName("div");

//     // Hide all of the tweet's content
//     for(let i = 0; i < content.length; i++) {
//         if(content[i] != null){
//             content[i].style.display = "none";
//         }
//     }

//     // Add disclaimer
//     var disclaimerDiv = document.createElement("div");
//     disclaimerDiv.className = "rabot_check";
//     disclaimerDiv.innerHTML = `<b>This tweet was likely created by a bot. <a>Show anyways...</a></b>`;

//     // Inject the HTML
//     tweet.appendChild(disclaimerDiv);
// }

// Function that removes all of the "rabot_check" divs that were injected into the page
function cleanupClassification() {
    const elms = document.getElementsByClassName('rabot_check')

    while(elms.length > 0){
        elms[0].remove()
    }
}


// Function that removes all of the "rabot_check" divs that were injected into the page
function revertTweetRemoval() {
    const elms = document.getElementsByClassName('rabot_disclaimer')

    while(elms.length > 0){
        elms[0].remove()
    }

    //  FIXME: Don't just hide every div, make them all the child of a new div and toggle that display to hidden / block
    document.querySelectorAll('[data-testid="tweet"]').forEach(tweet => {
        const content = tweet.getElementsByTagName("div");

        // Show all of the tweet's content
        for(let i = 0; i < content.length; i++) {
            if(content[i] != null){
                content[i].style.display = "inline";
            }
        }
    });
}