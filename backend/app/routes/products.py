"""Product management routes."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_admin_user
from app.core.schemas import ProductCreate, ProductUpdate, ProductResponse
from app.core.utils import validate_pagination, not_found_error
from app.models.product import Product
from app.models.user import User

router = APIRouter(prefix="/api/products", tags=["Products"])


@router.post("/", response_model=ProductResponse, status_code=201)
async def create_product(
    product_data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a product for the current user."""
    result = await db.execute(
        select(Product).where(
            Product.sku == product_data.sku,
            Product.owner_id == current_user.id
        )
    )
    existing_product = result.scalar_one_or_none()

    if existing_product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product with SKU '{product_data.sku}' already exists"
        )

    new_product = Product(**product_data.model_dump(), owner_id=current_user.id)
    db.add(new_product)
    await db.commit()
    await db.refresh(new_product)

    return new_product


@router.get("/", response_model=List[ProductResponse])
async def get_products(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return paginated products for the current user."""
    validate_pagination(skip, limit)

    result = await db.execute(
        select(Product)
        .where(Product.owner_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    products = result.scalars().all()

    return products


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return one product by ID for the current user."""
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.owner_id == current_user.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise not_found_error("Product", product_id)

    return product


@router.get("/sku/{sku}", response_model=ProductResponse)
async def get_product_by_sku(
    sku: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return one product by SKU for the current user."""
    result = await db.execute(
        select(Product).where(
            Product.sku == sku,
            Product.owner_id == current_user.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise not_found_error("Product", sku, "SKU")

    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update a product for the current admin user."""
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.owner_id == current_user.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise not_found_error("Product", product_id)

    if product_data.sku and product_data.sku != product.sku:
        sku_check = await db.execute(
            select(Product).where(
                Product.sku == product_data.sku,
                Product.owner_id == current_user.id
            )
        )
        if sku_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with SKU '{product_data.sku}' already exists"
            )

    update_data = product_data.model_dump(exclude_unset=True)

    final_cost = update_data.get('cost_price', product.cost_price)
    final_sell = update_data.get('sell_price', product.sell_price)

    if final_sell < final_cost:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"sell_price ({final_sell}) must be >= cost_price ({final_cost})"
        )

    for field, value in update_data.items():
        setattr(product, field, value)

    await db.commit()
    await db.refresh(product)

    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete a product for the current admin user."""
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.owner_id == current_user.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise not_found_error("Product", product_id)

    await db.delete(product)
    await db.commit()

    return None
