"""Authentication schemas."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Login request."""

    username: str = Field(..., description="Username")
    password: str = Field(..., description="Password")


class LoginResponse(BaseModel):
    """Login response with access token."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field("bearer", description="Token type")


class UserInfo(BaseModel):
    """Current user information."""

    username: str
    email: str
    first_name: str
    last_name: str
    phone_number: str = ""
    role: str = "user"
