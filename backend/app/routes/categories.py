"""Category management routes."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_current_admin_user
from app.core.schemas import CategoryCreate, CategoryResponse
from app.models.category import Category
from app.models.user import User

router = APIRouter(prefix="/api/categories", tags=["Categories"])


@router.get("/", response_model=List[CategoryResponse])
async def get_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return all categories for the current user."""
    result = await db.execute(
        select(Category)
        .where(Category.owner_id == current_user.id)
        .order_by(Category.name)
    )
    categories = result.scalars().all()
    return categories


@router.post("/", response_model=CategoryResponse, status_code=201)
async def create_category(
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Create a category for the current admin user."""
    result = await db.execute(
        select(Category).where(
            Category.name == category_data.name,
            Category.owner_id == current_user.id
        )
    )
    existing_category = result.scalar_one_or_none()

    if existing_category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{category_data.name}' already exists"
        )

    new_category = Category(**category_data.model_dump(), owner_id=current_user.id)
    db.add(new_category)
    await db.commit()
    await db.refresh(new_category)

    return new_category


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category_data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update a category for the current admin user."""
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.owner_id == current_user.id
        )
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with ID {category_id} not found"
        )

    if category_data.name != category.name:
        existing = await db.execute(
            select(Category).where(
                Category.name == category_data.name,
                Category.owner_id == current_user.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category '{category_data.name}' already exists"
            )

    category.name = category_data.name
    await db.commit()
    await db.refresh(category)

    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Delete a category for the current admin user."""
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.owner_id == current_user.id
        )
    )
    category = result.scalar_one_or_none()

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with ID {category_id} not found"
        )

    await db.delete(category)
    await db.commit()

    return None
