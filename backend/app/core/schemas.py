"""
Pydantic schemas for request/response validation in OptiTrack WMS.
"""

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
from decimal import Decimal


# ================= สกีมาผู้ใช้ =================

class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., pattern="^(ADMIN|STAFF|USER)$")
    image_url: Optional[str] = Field(None, max_length=500)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = Field(None, pattern="^(ADMIN|STAFF|USER)$")
    image_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


# ================= สกีมาสินค้า =================

class ProductBase(BaseModel):
    sku: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    supplier: Optional[str] = Field(None, max_length=255)
    cost_price: Decimal = Field(..., ge=0, decimal_places=2)
    sell_price: Decimal = Field(..., ge=0, decimal_places=2)
    min_stock_level: int = Field(default=0, ge=0)
    unit: str = Field(default="pcs", max_length=50)
    image_url: Optional[str] = Field(None, max_length=500)


class ProductCreate(ProductBase):
    @field_validator('sell_price')
    @classmethod
    def validate_sell_price(cls, v, info):
        if 'cost_price' in info.data and v < info.data['cost_price']:
            raise ValueError(f'sell_price ({v}) must be greater than or equal to cost_price ({info.data["cost_price"]})')
        return v


class ProductUpdate(BaseModel):
    sku: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    supplier: Optional[str] = Field(None, max_length=255)
    cost_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    sell_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    min_stock_level: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=50)
    image_url: Optional[str] = Field(None, max_length=500)

    @field_validator('sell_price')
    @classmethod
    def validate_sell_price(cls, v, info):
        if v is not None and 'cost_price' in info.data and info.data['cost_price'] is not None:
            if v < info.data['cost_price']:
                raise ValueError(f'sell_price ({v}) must be greater than or equal to cost_price ({info.data["cost_price"]})')
        return v


class ProductResponse(ProductBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ================= สกีมาสินค้าคงคลัง =================

class InventoryBase(BaseModel):
    product_id: int
    location: str = Field(..., min_length=1, max_length=50)
    quantity: int = Field(default=0, ge=0)
    status: str = Field(default="IN_STOCK", pattern="^(IN_STOCK|LOW_STOCK|OUT_OF_STOCK)$")


class InventoryCreate(InventoryBase):
    pass


class InventoryUpdate(BaseModel):
    location: Optional[str] = Field(None, min_length=1, max_length=50)
    quantity: Optional[int] = Field(None, ge=0)
    status: Optional[str] = Field(None, pattern="^(IN_STOCK|LOW_STOCK|OUT_OF_STOCK)$")


class InventoryResponse(InventoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class InventoryWithProductResponse(BaseModel):
    """Inventory response with nested product information."""
    id: int
    product_id: int
    location: str
    quantity: int
    status: str
    product: ProductResponse  # รายละเอียดสินค้าที่ซ้อนกัน

    model_config = ConfigDict(from_attributes=True)


# ================= สกีมาธุรกรรม =================

class TransactionBase(BaseModel):
    ref_code: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., pattern="^(INBOUND|OUTBOUND|ADJUST)$")
    quantity: int = Field(..., gt=0)
    product_id: int


class TransactionCreate(BaseModel):
    """
    Transaction creation schema.
    unit_price will be auto-populated from product's current price.
    """
    type: str = Field(..., pattern="^(INBOUND|OUTBOUND|ADJUST)$")
    quantity: int = Field(..., gt=0)
    product_id: int
    location: str = Field(..., min_length=1, max_length=50)
    notes: Optional[str] = Field(None, max_length=500)
    created_at: Optional[datetime] = None


class TransactionResponse(BaseModel):
    id: int
    ref_code: str
    type: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    status: str
    location: Optional[str] = None
    notes: Optional[str] = None
    user_id: int
    product_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TransactionWithProductResponse(BaseModel):
    """Transaction response with nested product information."""
    id: int
    ref_code: str
    type: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    status: str
    location: Optional[str] = None
    notes: Optional[str] = None
    user_id: int
    product_id: int
    created_at: datetime
    product: ProductResponse  # รายละเอียดสินค้าที่ซ้อนกัน

    model_config = ConfigDict(from_attributes=True)


# ================= สกีมาหมวดหมู่ =================

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(CategoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ================= สกีมา AI Chat =================

class ChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str

class AIChatMessage(BaseModel):
    message: str = Field(..., min_length=1)
    history: Optional[list[ChatHistoryItem]] = Field(default=[])


# ================= สกีมาการยืนยันตัวตน =================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ================= สกีมาแดชบอร์ด =================

class DashboardStats(BaseModel):
    total_products: int
    total_inventory_value: Decimal
    low_stock_count: int
    total_transactions_today: int


class SalesVsCostData(BaseModel):
    date: str
    sales: Decimal
    cost: Decimal
    profit: Decimal


# ================= สกีมาสถานที่ =================

class LocationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    capacity: int = Field(..., ge=0)


class LocationCreate(LocationBase):
    pass


class LocationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=255)
    capacity: Optional[int] = Field(None, ge=0)


class LocationResponse(LocationBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ================= สกีมาเมตริกแดชบอร์ด =================

class StorageHealthMetrics(BaseModel):
    warehouse_capacity_pct: float
    warehouse_capacity_label: str
