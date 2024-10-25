chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "OFF",
    });
});

const twitterURL = 'https://x.com/';


chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === 'user_scrolled' && sender.tab.url.startsWith(twitterURL)) {

        console.log('User scrolled on page:', sender.tab.url);

        await chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: injectClassification,
        });
    }
});


chrome.action.onClicked.addListener(async (tab) => {

    if (tab.url.startsWith(twitterURL)) {

        // Retrieve the action badge to check if the extension is 'ON' or 'OFF'
        const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
        // Next state will always be the opposite
        const nextState = prevState === 'ON' ? 'OFF' : 'ON';

        // Set the action badge to the next state
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: nextState,
        });

        if (nextState === "ON") {
            // Insert the CSS file when the user turns the extension on
            await chrome.scripting.insertCSS({
                files: ["rabotStyles.css"],
                target: { tabId: tab.id },
            });

        } else if (nextState === "OFF") {
            // Remove the CSS file when the user turns the extension off
            await chrome.scripting.removeCSS({
                files: ["rabotStyles.css"],
                target: { tabId: tab.id },
            });
        }
    }
});

function injectClassification() {
    document.querySelectorAll('[data-testid="tweet"]').forEach(tweet => {

       

        if (tweet.getElementsByClassName("rabot_check").length == 0) {
            // Do not rerender tweet if it has already been assessed. 
            // (Maybe also keep list of tweets so you don't need to recompute on scroll back)
            
            var handle = tweet.querySelector('[data-testid="User-Name"]').textContent.split("@");
            var name = handle[0]

            handle = handle[1].split("·")

            var username = handle[0]
            var date =  handle[handle.length - 1]
            var tweetText = tweet.querySelector('[data-testid="tweetText"').textContent


        

            var percentage = Math.random(); //FIXME: Assign the classification here
    
            var innerDiv = document.createElement("div");
            innerDiv.className = "rabot_check";
            innerDiv.innerHTML = `<b>${(percentage * 100).toFixed(1)}%</b>`;
    
            if (percentage < 0.5) {
                innerDiv.style.border = `solid 5px rgb(${200 * percentage * 2}, 250, ${2 * percentage * 200})`;
            } else {
                innerDiv.style.border = `solid 5px rgb(250, ${220 - (percentage - 0.5) * 2 * 220}, ${220 - (percentage - 0.5) * 2 * 220})`;
            }


            tweet.appendChild(innerDiv);


            console.log(name)
            console.log(username)
            console.log(date)
            console.log(tweetText)





            // var spans = tweet.querySelectorAll('span');

            // if(spans != null) {
            //     spans.forEach(elem => {
            //         console.log(elem.textContent)
            //     });
            // }
        }
    });


}

