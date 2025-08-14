// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDB0uJmNJO0b-0_5qzgicJt1eI-e2A91Z8",
  authDomain: "textchatwow.firebaseapp.com",
  databaseURL: "https://textchatwow-default-rtdb.firebaseio.com",
  projectId: "textchatwow",
  storageBucket: "textchatwow.firebasestorage.app",
  messagingSenderId: "890545047425",
  appId: "1:890545047425:web:e5d7abb13162e3072a4a80"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM элементы
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('login-btn');
const errorMessage = document.getElementById('error-message');
const currentUsernameSpan = document.getElementById('current-username');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');

// Глобальные переменные
let currentUser = null;
let username = '';
let messagesRef = null;
let usersRef = null;
let messagesListener = null;

// Проверка авторизации при загрузке
auth.onAuthStateChanged(user => {
    if (user) {
        checkUserSession(user.uid);
    }
});

// Обработчик входа
loginBtn.addEventListener('click', () => {
    const inputUsername = usernameInput.value.trim();
    
    if (!inputUsername) {
        showError('Введите имя пользователя');
        return;
    }
    
    if (inputUsername.length > 20) {
        showError('Имя пользователя не должно превышать 20 символов');
        return;
    }
    
    auth.signInAnonymously()
        .then((credential) => {
            return checkUsernameAvailability(inputUsername, credential.user.uid);
        })
        .then(() => {
            username = usernameInput.value.trim();
            currentUser = auth.currentUser;
            
            usersRef = database.ref('users/' + currentUser.uid);
            usersRef.set({
                username: username,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            
            setupChat();
        })
        .catch(error => {
            console.error('Ошибка входа:', error);
            showError(error.message);
        });
});

function checkUsernameAvailability(username, userId) {
    return new Promise((resolve, reject) => {
        database.ref('users').once('value', snapshot => {
            const users = snapshot.val() || {};
            
            for (const uid in users) {
                if (users[uid].username === username && uid !== userId) {
                    reject(new Error('Это имя пользователя уже занято'));
                    return;
                }
            }
            
            resolve();
        });
    });
}

function checkUserSession(userId) {
    database.ref('users/' + userId).once('value')
        .then(snapshot => {
            const userData = snapshot.val();
            
            if (userData) {
                username = userData.username;
                currentUser = auth.currentUser;
                setupChat();
            } else {
                auth.signOut();
            }
        })
        .catch(error => {
            console.error('Ошибка проверки сессии:', error);
            auth.signOut();
        });
}

function setupChat() {
    authContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    currentUsernameSpan.textContent = username;
    
    messagesRef = database.ref('messages');
    usersRef = database.ref('users/' + currentUser.uid);
    
    setupMessagesListener();
    
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    logoutBtn.addEventListener('click', logout);
    cleanupOldMessages();
    setInterval(cleanupOldMessages, 30000);
    
    window.addEventListener('beforeunload', () => {
        logout();
    });
}

function setupMessagesListener() {
    messagesListener = messagesRef.orderByChild('timestamp').on('child_added', snapshot => {
        const message = snapshot.val();
        displayMessage(message, snapshot.key);
    });
}

function displayMessage(message, messageId) {
    const messageElement = document.createElement('div');
    const isCurrentUser = message.userId === currentUser.uid;
    
    messageElement.className = `message ${isCurrentUser ? 'current-user' : 'other-user'}`;
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    messageInfo.innerHTML = `
        <span class="username">${message.username}</span>
        <span class="timestamp">${formatTime(message.timestamp)}</span>
    `;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = message.text;
    
    messageElement.appendChild(messageInfo);
    messageElement.appendChild(messageText);
    messageElement.dataset.id = messageId;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    setTimeout(() => {
        const messageToRemove = document.querySelector(`[data-id="${messageId}"]`);
        if (messageToRemove) {
            messageToRemove.remove();
        }
        messagesRef.child(messageId).remove().catch(console.error);
    }, 60000);
}

function sendMessage() {
    const text = messageInput.value.trim();
    
    if (!text) return;
    
    const message = {
        text: text,
        username: username,
        userId: currentUser.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    messagesRef.push(message)
        .then(() => {
            messageInput.value = '';
        })
        .catch(error => {
            console.error('Ошибка отправки сообщения:', error);
        });
}

function logout() {
    if (messagesListener) {
        messagesRef.off('child_added', messagesListener);
    }
    
    if (usersRef) {
        usersRef.remove()
            .then(() => {
                return auth.signOut();
            })
            .then(() => {
                return messagesRef.orderByChild('userId').equalTo(currentUser.uid).once('value')
                    .then(snapshot => {
                        const updates = {};
                        snapshot.forEach(child => {
                            updates[child.key] = null;
                        });
                        return database.ref().update(updates);
                    });
            })
            .then(() => {
                resetUI();
            })
            .catch(error => {
                console.error('Ошибка выхода:', error);
                resetUI();
            });
    } else {
        auth.signOut();
        resetUI();
    }
}

function cleanupOldMessages() {
    const oneMinuteAgo = Date.now() - 60000;
    
    messagesRef.orderByChild('timestamp').endAt(oneMinuteAgo).once('value')
        .then(snapshot => {
            const updates = {};
            snapshot.forEach(child => {
                updates[child.key] = null;
                const messageToRemove = document.querySelector(`[data-id="${child.key}"]`);
                if (messageToRemove) {
                    messageToRemove.remove();
                }
            });
            return database.ref().update(updates);
        })
        .catch(console.error);
}

function resetUI() {
    authContainer.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    usernameInput.value = '';
    messagesContainer.innerHTML = '';
    messageInput.value = '';
    currentUser = null;
    username = '';
    messagesRef = null;
    usersRef = null;
    messagesListener = null;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showError(message) {
    errorMessage.textContent = message;
    setTimeout(() => {
        errorMessage.textContent = '';
    }, 3000);
                                    }
