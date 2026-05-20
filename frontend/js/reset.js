setTimeout(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'login.html?reset=success';
}, 1500);
