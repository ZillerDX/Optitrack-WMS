"""Inventory management routes."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import InventoryResponse, InventoryWithProductResponse, InventoryCreate
from app.core.utils import validate_pagination, not_found_error
from app.models.inventory import Inventory
from app.models.user import User
from app.models.product import Product
from app.models.location import Location

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


@router.post("/", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
async def create_inventory(
    inventory_data: InventoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create inventory for a product at a user-owned location."""
    result = await db.execute(
        select(Product).where(
            Product.id == inventory_data.product_id,
            Product.owner_id == current_user.id
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise not_found_error("Product", inventory_data.product_id)

    loc_result = await db.execute(
        select(Location).where(
            Location.name == inventory_data.location,
            Location.owner_id == current_user.id
        )
    )
    location_obj = loc_result.scalar_one_or_none()
    if not location_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Location '{inventory_data.location}' not found. Please create it first."
        )

    result = await db.execute(
        select(Inventory).where(
            Inventory.product_id == inventory_data.product_id,
            Inventory.location == inventory_data.location
        )
    )
    existing_inventory = result.scalar_one_or_none()
    if existing_inventory:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Inventory for product ID {inventory_data.product_id} at location '{inventory_data.location}' already exists"
        )

    location_quantity_result = await db.execute(
        select(func.coalesce(func.sum(Inventory.quantity), 0))
        .select_from(Inventory)
        .join(Product, Inventory.product_id == Product.id)
        .where(
            Inventory.location == inventory_data.location,
            Product.owner_id == current_user.id
        )
    )
    current_location_quantity = location_quantity_result.scalar() or 0
    projected_location_quantity = current_location_quantity + inventory_data.quantity

    if projected_location_quantity > location_obj.capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Location '{inventory_data.location}' capacity exceeded. "
                f"Capacity: {location_obj.capacity}, Current stock: {current_location_quantity}, "
                f"Projected stock: {projected_location_quantity}"
            )
        )

    new_inventory = Inventory(
        product_id=inventory_data.product_id,
        location=inventory_data.location,
        quantity=inventory_data.quantity,
        status=inventory_data.status
    )
    db.add(new_inventory)
    await db.commit()
    await db.refresh(new_inventory)
    return new_inventory


@router.get("/locations", response_model=List[str])
async def get_locations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return all location names for the current user."""
    result = await db.execute(
        select(Location.name)
        .where(Location.owner_id == current_user.id)
        .order_by(Location.name)
    )
    locations = result.scalars().all()
    return locations


@router.get("/", response_model=List[InventoryWithProductResponse])
async def get_inventory(
    skip: int = 0,
    limit: int = 100,
    location: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return inventory with product details for the current user."""
    validate_pagination(skip, limit)

    query = (
        select(Inventory)
        .join(Product)
        .where(Product.owner_id == current_user.id)
        .options(selectinload(Inventory.product))
    )

    if location:
        query = query.where(Inventory.location == location)

    result = await db.execute(
        query
        .offset(skip)
        .limit(limit)
    )
    inventory_items = result.scalars().all()

    return inventory_items


@router.get("/{inventory_id}", response_model=InventoryWithProductResponse)
async def get_inventory_item(
    inventory_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return one inventory item with product details for the current user."""
    result = await db.execute(
        select(Inventory)
        .join(Product)
        .options(selectinload(Inventory.product))
        .where(
            Inventory.id == inventory_id,
            Product.owner_id == current_user.id
        )
    )
    inventory_item = result.scalar_one_or_none()

    if not inventory_item:
        raise not_found_error("Inventory item", inventory_id)

    return inventory_item
