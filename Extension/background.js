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
    chrome.storage.local.set({'bot_threshold': 0.75})

});


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

        await chrome.storage.local.set({process_tweets: {"test":0}});

    } else if (nextState === "OFF") {
        // Remove the CSS file when the user turns the extension off
        await chrome.scripting.removeCSS({
            files: ["rabotStyles.css"],
            target: { tabId: tabId },
        });
    }
}




/**
 * Function that receives a message from content.js, and wakes up the service worker to
 * execute the classification injection function.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if(request.message === 'user_scrolled' && sender.tab.url.startsWith(twitterURL)){

        // Execute the HTML injection function in real-time as new tweets are loaded
        await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: getEstimates,
        })
    }

    if (request.message === 'set_bot_threshold'){
        console.log("Update threshold: " + request.val)
        await chrome.storage.local.set({bot_threshold: request.val / 100})
    }
});




/**
 * Function that receives a message from the getEstimates function (which sends updated data)
 * and processes HTML to be injected for newly received tweets.
 */
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'update_tweets') {

        chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
            // Get the active tab
            const activeTab = tabs[0];  
    
            // console.log(activeTab)
            // Check for valid context 
            if(activeTab.url.startsWith(twitterURL)) {
                // Execute the HTML injection function for hiding bot content
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: hideContent,
                });


                // Execute the HTML injection function for adding tweet classifications
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: addClassification,
                });



            }
        })
    }
});






// Listen to see if the show estimate switch (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'activate_estimate' && request.tab.url.startsWith(twitterURL)) {
        chrome.storage.local.set({'activate_estimate': request.checked}).then(() => {
         
            if(request.checked) {
                // Automatically injected estimates without need for scrolling
                chrome.scripting.executeScript({
                    target: { tabId: request.tab.id },
                    func: getEstimates,
                });

            } else {
                // Clean-up function for the injected estimates
                chrome.scripting.executeScript({
                    target: { tabId: request.tab.id },
                    func: cleanupClassification,
                });
                
            }
        });

        

        // Check if the extension should be active
        await toggleActive(request.tab.id);
    }
});


// Listen to see if the hide bot content slider (from index.html) is used 
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'hide_bot_content' && request.tab.url.startsWith(twitterURL)) {
        chrome.storage.local.set({'hide_bot_content': request.checked}).then(async () => {
             if(request.checked) {
                // Automatically injected estimates without need for scrolling
                await chrome.scripting.executeScript({
                    target: { tabId: request.tab.id },
                    func: getEstimates,
                });

            } else {
                // TODO: Create Clean-up function to reverse hiding tweet content
                await chrome.scripting.executeScript({
                    target: { tabId: request.tab.id },
                    func: revertTweetRemoval,
                });
            }
        });
       
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









// ##########  FUNCTIONS TO IMPLEMENT  ##########



async function getEstimates() {
    const foundTweets = []; // Local tweets from this batch
    let tweet_dict = await chrome.storage.local.get(['process_tweets']);    // All tweets that have been found so far
    const allPromises = [];  // List of promises to process

// Search through all currently rendered tweets
    document.querySelectorAll('[data-testid="tweet"]').forEach(async tweet => {
        const psudoId = tweet.getAttribute("aria-labelledby").split(" ")[0];
        // Do not rerender tweet if it has already been assessed. 
        if (!(psudoId in tweet_dict.process_tweets)) {
            
            try { // Scrape tweet data
                const handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
                const name = handle[0]
                const username = handle[1].split("·")[0]
                // const date = handle[handle.length - 1]   // Probably don't need this

                
                tweet_dict.process_tweets[psudoId] = -1 // Set val to -1 to signal that this tweet has been found
                await chrome.storage.local.set({process_tweets: tweet_dict.process_tweets})


                const isVerified = tweet.getAttribute("aria-labelledby").split(" ")[0];

                // TODO:  Count number of mentions?
                
                var tweetText = ""
                if(tweet.querySelector('[data-testid="tweetText"') != null) {
                    tweetText = tweet.querySelector('[data-testid="tweetText"').textContent
                }

                // TODO: Make this batched to reduce # of connections to the API?
                // Construct API payload
                const tweetForm = new FormData();
                tweetForm.append('username', username);
                tweetForm.append('display_name', name);
                tweetForm.append('tweet_content', tweetText);
                tweetForm.append('psudo_id', psudoId);



                const fetchPromise = fetch("http://127.0.0.1:5000/verify", {
                    method: "POST",
                    body: tweetForm,
            
                    })
                    .then((response) => {
                        if(response["status"] == 200){  // Only continue if status is ok
                            return response.json();
                        }                       // TODO: Handel error codes here
                        // return Promise.reject(response["status"])
                    })
                    .then((json) => { 
                        // Add each tweet to the array with its prediction
                        tweet_dict.process_tweets[psudoId] = json.percent


                        chrome.storage.local.set({process_tweets: tweet_dict.process_tweets}).then(() => {
                            chrome.runtime.sendMessage({message:'update_tweets'});
                        });

                        foundTweets.push({tweetId:psudoId, score: json.percent})
                    });

                allPromises.push(fetchPromise);

            } catch (error) {   //TODO: Create a better handler for this
                console.error(error)
            }

        }})

        // Wait for all promises to resolve and send the data to local storage
        Promise.all(allPromises)
}





/**
 * Create HTML content to represent the classification and inject it into the site.
 */
async function addClassification() {
    // Fetch stored tweet data in chrome's local storage
    chrome.storage.local.get(['process_tweets'], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving data:", chrome.runtime.lastError);

        } else {
            const foundTweets = result.process_tweets; // Get the id and score of most recent tweets

            const tweetIds = Object.keys(foundTweets)
            // console.log("found tweets: ", tweetIds)
            const activate_estimate = await chrome.storage.local.get(['activate_estimate']);

            tweetIds.forEach(id => {
                // Find the tweet by its psudoId
                const tweet = document.querySelector('[aria-labelledby*="' + id + '"]')

                if(tweet == null || foundTweets[id] == -1) { // Case where tweet can no longer be found... || case where tweet isn't ready
                    return;
                }

                // Check if it already has a clasification
                if(tweet.getElementsByClassName("rabot_check").length == 0 && activate_estimate.activate_estimate) {
                    const percent = foundTweets[id]; // Bot estimation score provided by our classifier

                    // Create HTML elements to be injected 
                    var classificationDiv = document.createElement("div");
                    classificationDiv.className = "rabot_check";
                    classificationDiv.innerHTML = `<b>${(percent * 100).toFixed(1)}%</b>`;

                    // Set the color of the classification's border depending on value
                    if (percent < 0.5) {
                        classificationDiv.style.border = `solid 5px rgb(${200 * percent * 2}, 250, ${2 * percent * 200})`;
                    } else {
                        classificationDiv.style.border = `solid 5px rgb(250, ${220 - (percent - 0.5) * 2 * 220}, ${220 - (percent - 0.5) * 2 * 220})`;
                    }

                    // Inject the HTML onto the page
                    tweet.appendChild(classificationDiv);
                }
            });
        }
    });
}


// Function that removes all of the "rabot_check" divs that were injected into the page
function cleanupClassification() {
    const elms = document.getElementsByClassName('rabot_check')

    while(elms.length > 0){
        elms[0].remove()
    }
}



/**
 * Inject HTML to content from tweets that are likely from bots (if slider is set for this).
 */
async function hideContent() {
    // Fetch stored tweet data in chrome's local storage
    chrome.storage.local.get(['process_tweets'], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving data:", chrome.runtime.lastError);

        } else {
            const foundTweets = result.process_tweets; // Get the id and score of most recent tweets
            const hide_bots = await chrome.storage.local.get(['hide_bot_content']);
            const tweetIds = Object.keys(foundTweets)

            // Get current threshold (as set by user)
            const threshold = await chrome.storage.local.get(['bot_threshold']);

            tweetIds.forEach(id => {


                // Find the tweet by its psudoId
                const tweet = document.querySelector('[aria-labelledby*="' + id + '"]')

                if(tweet == null || foundTweets[id] == -1) { // Case where tweet can no longer be found...
                    return;
                }


                // Check if it already has a classification (FIXME?)
                if(tweet.getElementsByClassName("rabot_disclaimer").length == 0 && hide_bots.hide_bot_content) {

                    if(foundTweets[id] > threshold.bot_threshold){
                        // Get all divs from the base tweet
                        const content = tweet.getElementsByTagName("div");

                        // Hide all of the tweet's content
                        for(let i = 0; i < content.length; i++) {
                            if(content[i] != null && content[i].className !== "rabot_check"){  // FIXME: This still hides tweet classifications
                                
                                content[i].style.display = "none";
                            }
                        }

                        var btn = document.createElement("button");
                        btn.innerText = "Show anyways...";

                        // Add event listener to show the tweet "Show anyways..." button
                        btn.addEventListener("click", function(event) {
                            event.preventDefault(); // Prevent the default anchor action (e.g., page scroll)

                            // Restore the tweet's content
                            const tweet = document.querySelector('[aria-labelledby*="' + id + '"]');

                            if (tweet != null) {
                                // Get all divs from the base tweet
                                const content = tweet.getElementsByTagName("div");

                                // Show all the tweet's hidden content
                                for (let i = 0; i < content.length; i++) {
                                    if (content[i] != null && content[i].className !== "rabot_check") {
                                        content[i].style.display = ""; // Reset display to original state
                                    }
                                }

                                // Remove disclaimer
                                const elms = tweet.getElementsByClassName('rabot_disclaimer')[0].remove()


                                // Revert height
                                tweet.style.height = ""


                                // Hack: prevent relabeling
                                var disclaimerDiv = document.createElement("div");
                                disclaimerDiv.className = "rabot_disclaimer";
                                disclaimerDiv.style.width = "0px";
                                disclaimerDiv.style.height = "0px";


                                // Inject the HTML
                                tweet.appendChild(disclaimerDiv);

                            }
                        });

                        // Add disclaimer
                        var disclaimerDiv = document.createElement("div");
                        disclaimerDiv.className = "rabot_disclaimer";
                        disclaimerDiv.innerHTML = `<span>This Tweet was likely created by a bot.&nbsp;</span>`;
                        disclaimerDiv.appendChild(btn);

                        tweet.style.height = "200px"; // TEMP: fix to prevent too many re-renders

                        // Inject the HTML
                        tweet.appendChild(disclaimerDiv);


                    } else {    //FIXME: hack to prevent tweet from getting reclassified
                        // Add disclaimer
                        var disclaimerDiv = document.createElement("div");
                        disclaimerDiv.className = "rabot_disclaimer";
                        disclaimerDiv.style.width = "0px";
                        disclaimerDiv.style.height = "0px";


                        // Inject the HTML
                        tweet.appendChild(disclaimerDiv);
                    }
                }
            });
        }
    });
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
                content[i].style.display = "";
            }
        }
        
        tweet.style.height = ""
    });
}