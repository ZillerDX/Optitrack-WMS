"""Location management routes."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import LocationCreate, LocationResponse, LocationUpdate
from app.models.inventory import Inventory
from app.models.product import Product
from app.models.location import Location
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/api/locations", tags=["Locations"])

@router.get("/", response_model=List[LocationResponse])
async def get_locations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return all locations for the current user."""
    result = await db.execute(
        select(Location)
        .where(Location.owner_id == current_user.id)
        .order_by(Location.name)
    )
    locations = result.scalars().all()
    return locations

@router.post("/", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    location_data: LocationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a location for the current user."""
    result = await db.execute(
        select(Location).where(
            Location.name == location_data.name,
            Location.owner_id == current_user.id
        )
    )
    existing_location = result.scalar_one_or_none()
    
    if existing_location:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Location '{location_data.name}' already exists"
        )
    
    new_location = Location(
        name=location_data.name, 
        description=location_data.description,
        capacity=location_data.capacity,
        owner_id=current_user.id
    )
    db.add(new_location)
    await db.commit()
    await db.refresh(new_location)
    return new_location


@router.put("/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: int,
    location_data: LocationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a location and rename dependent records when needed."""
    result = await db.execute(
        select(Location).where(
            Location.id == location_id,
            Location.owner_id == current_user.id
        )
    )
    location = result.scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location with ID {location_id} not found"
        )

    update_data = location_data.model_dump(exclude_unset=True)
    old_name = location.name
    new_name = old_name

    if "name" in update_data:
        new_name = update_data["name"].strip()
        if not new_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Location name cannot be empty"
            )

        duplicate_result = await db.execute(
            select(Location).where(
                Location.name == new_name,
                Location.owner_id == current_user.id,
                Location.id != location_id
            )
        )
        duplicate_location = duplicate_result.scalar_one_or_none()

        if duplicate_location:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Location '{new_name}' already exists"
            )

    current_quantity_result = await db.execute(
        select(func.coalesce(func.sum(Inventory.quantity), 0))
        .select_from(Inventory)
        .join(Product, Inventory.product_id == Product.id)
        .where(
            Inventory.location == old_name,
            Product.owner_id == current_user.id
        )
    )
    current_location_quantity = current_quantity_result.scalar() or 0

    if "capacity" in update_data and update_data["capacity"] < current_location_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Capacity cannot be lower than current stock. "
                f"Current stock at '{old_name}': {current_location_quantity}"
            )
        )

    if "name" in update_data and new_name != old_name:
        inventory_ids_result = await db.execute(
            select(Inventory.id)
            .join(Product, Inventory.product_id == Product.id)
            .where(
                Inventory.location == old_name,
                Product.owner_id == current_user.id
            )
        )
        inventory_ids = inventory_ids_result.scalars().all()

        if inventory_ids:
            await db.execute(
                update(Inventory)
                .where(Inventory.id.in_(inventory_ids))
                .values(location=new_name)
            )

        await db.execute(
            update(Transaction)
            .where(
                Transaction.location == old_name,
                Transaction.user_id == current_user.id
            )
            .values(location=new_name)
        )

        location.name = new_name

    if "description" in update_data:
        location.description = update_data["description"]

    if "capacity" in update_data:
        location.capacity = update_data["capacity"]

    await db.commit()
    await db.refresh(location)
    return location


@router.delete("/{location_id}")
async def delete_location(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an unused location for the current user."""
    result = await db.execute(
        select(Location).where(
            Location.id == location_id,
            Location.owner_id == current_user.id
        )
    )
    location = result.scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location with ID {location_id} not found"
        )

    inventory_count_result = await db.execute(
        select(func.count(Inventory.id))
        .select_from(Inventory)
        .join(Product, Inventory.product_id == Product.id)
        .where(
            Inventory.location == location.name,
            Product.owner_id == current_user.id
        )
    )
    inventory_count = inventory_count_result.scalar() or 0

    if inventory_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete location '{location.name}' because it is still used by inventory records. "
                f"Move or delete those inventory records first."
            )
        )

    transaction_count_result = await db.execute(
        select(func.count(Transaction.id))
        .where(
            Transaction.location == location.name,
            Transaction.user_id == current_user.id
        )
    )
    transaction_count = transaction_count_result.scalar() or 0

    if transaction_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete location '{location.name}' because it is referenced by transaction history."
            )
        )

    await db.delete(location)
    await db.commit()
    return {"message": f"Location '{location.name}' deleted successfully"}
