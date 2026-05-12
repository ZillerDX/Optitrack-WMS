"""Transaction routes with inventory updates."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import TransactionCreate, TransactionResponse, TransactionWithProductResponse
from app.core.utils import validate_pagination, calculate_inventory_status, generate_ref_code
from app.models.transaction import Transaction, TransactionType, TransactionStatus
from app.models.product import Product
from app.models.inventory import Inventory
from app.models.user import User
from app.models.location import Location

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    transaction_data: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a transaction and apply its inventory impact."""
    result = await db.execute(
        select(Product).where(
            Product.id == transaction_data.product_id,
            Product.owner_id == current_user.id
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with ID {transaction_data.product_id} not found or access denied"
        )

    loc_result = await db.execute(
        select(Location).where(
            Location.name == transaction_data.location,
            Location.owner_id == current_user.id
        )
    )
    location_obj = loc_result.scalar_one_or_none()
    if not location_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Location '{transaction_data.location}' not found. Please create it first."
        )

    if transaction_data.type == TransactionType.INBOUND:
        unit_price = product.cost_price
    elif transaction_data.type == TransactionType.OUTBOUND:
        unit_price = product.sell_price
    else:
        unit_price = product.cost_price

    ref_code = generate_ref_code()
    total_price = unit_price * transaction_data.quantity

    new_transaction = Transaction(
        ref_code=ref_code,
        type=transaction_data.type,
        quantity=transaction_data.quantity,
        unit_price=unit_price,
        total_price=total_price,
        location=transaction_data.location,
        notes=transaction_data.notes,
        status=TransactionStatus.COMPLETED,
        user_id=current_user.id,
        product_id=transaction_data.product_id
    )

    if transaction_data.created_at:
        new_transaction.created_at = transaction_data.created_at

    db.add(new_transaction)

    inventory_result = await db.execute(
        select(Inventory).where(
            Inventory.product_id == transaction_data.product_id,
            Inventory.location == transaction_data.location
        )
    )
    inventory = inventory_result.scalar_one_or_none()

    location_quantity_result = await db.execute(
        select(func.coalesce(func.sum(Inventory.quantity), 0))
        .select_from(Inventory)
        .join(Product, Inventory.product_id == Product.id)
        .where(
            Inventory.location == transaction_data.location,
            Product.owner_id == current_user.id
        )
    )
    current_location_quantity = location_quantity_result.scalar() or 0
    existing_inventory_quantity = inventory.quantity if inventory else 0

    if transaction_data.type == TransactionType.INBOUND:
        projected_location_quantity = current_location_quantity + transaction_data.quantity
        if projected_location_quantity > location_obj.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Location '{transaction_data.location}' capacity exceeded. "
                    f"Capacity: {location_obj.capacity}, Current stock: {current_location_quantity}, "
                    f"Projected stock: {projected_location_quantity}"
                )
            )
    elif transaction_data.type == TransactionType.ADJUST:
        projected_location_quantity = current_location_quantity - existing_inventory_quantity + transaction_data.quantity
        if projected_location_quantity > location_obj.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Location '{transaction_data.location}' capacity exceeded. "
                    f"Capacity: {location_obj.capacity}, Current stock: {current_location_quantity}, "
                    f"Projected stock: {projected_location_quantity}"
                )
            )

    if inventory:
        if transaction_data.type == TransactionType.INBOUND:
            inventory.quantity += transaction_data.quantity
        elif transaction_data.type == TransactionType.OUTBOUND:
            if inventory.quantity < transaction_data.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock. Available: {inventory.quantity}, Requested: {transaction_data.quantity}"
                )
            inventory.quantity -= transaction_data.quantity
        else:
            inventory.quantity = transaction_data.quantity

        inventory.status = calculate_inventory_status(inventory.quantity, product.min_stock_level)
    else:
        if transaction_data.type == TransactionType.OUTBOUND:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No inventory found at location '{transaction_data.location}' for this product"
            )

        inventory = Inventory(
            product_id=transaction_data.product_id,
            location=transaction_data.location,
            quantity=transaction_data.quantity,
            status=calculate_inventory_status(transaction_data.quantity, product.min_stock_level)
        )
        db.add(inventory)

    await db.commit()
    await db.refresh(new_transaction)

    return new_transaction


@router.get("/", response_model=List[TransactionWithProductResponse])
async def get_transactions(
    skip: int = 0,
    limit: int = 100,
    product_id: int = None,
    type: str = None,
    location: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return paginated transactions with optional filters."""
    validate_pagination(skip, limit)

    query = (
        select(Transaction)
        .join(Product)
        .where(
            Transaction.user_id == current_user.id,
            Product.owner_id == current_user.id
        )
        .options(selectinload(Transaction.product))
        .order_by(Transaction.created_at.desc())
    )

    if product_id is not None:
        query = query.where(Transaction.product_id == product_id)

    if type is not None:
        query = query.where(Transaction.type == type)

    if location is not None:
        query = query.where(Transaction.location == location)

    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    transactions = result.scalars().all()

    return transactions


@router.get("/{transaction_id}", response_model=TransactionWithProductResponse)
async def get_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return one transaction with product details for the current user."""
    result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.product))
        .where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id
        )
    )
    transaction = result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with ID {transaction_id} not found or access denied"
        )

    return transaction
