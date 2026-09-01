import requests
import uuid

BASE_URL = "https://deep-spoons-admire.loca.lt"
HEADERS = {
    "Bypass-Tunnel-Reminder": "true",
    "Content-Type": "application/json",
    "User-Agent": "TestSprite-Runner/1.0"
}

def test_login_success():
    payload = {
        "email": "admin@optitrack.io",
        "password": "admin1234"
    }
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, headers=HEADERS, timeout=30)
    assert response.status_code == 200, f"Expected 200 for valid login, got {response.status_code}: {response.text}"
    data = response.json()
    assert "access_token" in data, f"Missing access_token in response: {data}"
    assert data.get("user", {}).get("email") == "admin@optitrack.io", f"User email mismatch: {data}"
    print("test_login_success PASSED!")

def test_login_invalid_password():
    payload = {
        "email": "admin@optitrack.io",
        "password": "wrongpassword999"
    }
    response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, headers=HEADERS, timeout=30)
    assert response.status_code in (400, 401), f"Expected 400/401 for invalid password, got {response.status_code}: {response.text}"
    print("test_login_invalid_password PASSED!")

def test_signup_and_signin():
    unique_email = f"operator_{uuid.uuid4().hex[:8]}@optitrack.io"
    register_payload = {
        "email": unique_email,
        "password": "Password123!",
        "first_name": "Test",
        "last_name": "Operator"
    }
    reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=register_payload, headers=HEADERS, timeout=30)
    assert reg_response.status_code in (200, 201), f"Expected 200/201 for register, got {reg_response.status_code}: {reg_response.text}"
    print("test_signup PASSED!")

    login_payload = {
        "email": unique_email,
        "password": "Password123!"
    }
    login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload, headers=HEADERS, timeout=30)
    assert login_response.status_code == 200, f"Expected 200 for login with new account, got {login_response.status_code}: {login_response.text}"
    print("test_signin_with_new_account PASSED!")

test_login_success()
test_login_invalid_password()
test_signup_and_signin()