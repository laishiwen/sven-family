"""Alembic configuration for stats service

Revision ID: 001_initial
Revises: 
Create Date: 2026-05-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create extensions
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "inet"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "citext"')
    
    # Create page_visits table
    op.create_table(
        'page_visits',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('page_path', sa.String(), nullable=False),
        sa.Column('user_ip', postgresql.INET(), nullable=False),
        sa.Column('user_ua', sa.Text(), nullable=True),
        sa.Column('referrer', sa.String(500), nullable=True),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('visited_at', sa.DateTime(), nullable=False),
        sa.Column('country', sa.String(50), nullable=True),
        sa.Column('city', sa.String(50), nullable=True),
        sa.Column('device_type', sa.String(20), nullable=True),
        sa.Column('dedup_key', sa.String(64), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_visits_date', 'page_visits', ['visited_at'])
    op.create_index('idx_visits_ip', 'page_visits', ['user_ip'])
    op.create_index('idx_visits_page', 'page_visits', ['page_path'])
    op.create_index('idx_visits_date_page', 'page_visits', ['visited_at', 'page_path'])
    op.create_index(sa.Index('page_visits_session_id_idx', 'page_visits', 'session_id'))
    op.create_index('idx_page_visits_dedup', 'page_visits', ['dedup_key'])
    
    # Create site_downloads table
    op.create_table(
        'site_downloads',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('file_id', sa.String(), nullable=False),
        sa.Column('file_name', sa.String(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=True),
        sa.Column('user_ip', postgresql.INET(), nullable=False),
        sa.Column('user_ua', sa.Text(), nullable=True),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('downloaded_at', sa.DateTime(), nullable=False),
        sa.Column('country', sa.String(50), nullable=True),
        sa.Column('city', sa.String(50), nullable=True),
        sa.Column('dedup_key', sa.String(64), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_site_downloads_date', 'site_downloads', ['downloaded_at'])
    op.create_index('idx_site_downloads_file', 'site_downloads', ['file_id'])
    op.create_index('idx_site_downloads_ip', 'site_downloads', ['user_ip'])
    op.create_index('idx_site_downloads_date_file', 'site_downloads', ['downloaded_at', 'file_id'])
    op.create_index(sa.Index('site_downloads_session_id_idx', 'site_downloads', 'session_id'))
    op.create_index('idx_site_downloads_dedup', 'site_downloads', ['dedup_key'])
    
    # Create session_info table
    op.create_table(
        'session_info',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('user_ip', postgresql.INET(), nullable=False),
        sa.Column('user_ua', sa.Text(), nullable=True),
        sa.Column('first_visit', sa.DateTime(), nullable=False),
        sa.Column('last_visit', sa.DateTime(), nullable=False),
        sa.Column('visit_count', sa.Integer(), nullable=False),
        sa.Column('country', sa.String(50), nullable=True),
        sa.Column('city', sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id'),
    )
    op.create_index('session_info_session_id_idx', 'session_info', ['session_id'], unique=True)

    # Create desktop_events table
    op.create_table(
        'desktop_events',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False, server_default='app_open'),
        sa.Column('user_ip', postgresql.INET(), nullable=False),
        sa.Column('user_ua', sa.Text(), nullable=True),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('machine_info', postgresql.JSONB(), nullable=True),
        sa.Column('os_name', sa.String(50), nullable=True),
        sa.Column('os_version', sa.String(50), nullable=True),
        sa.Column('cpu_arch', sa.String(20), nullable=True),
        sa.Column('app_version', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('country', sa.String(50), nullable=True),
        sa.Column('city', sa.String(50), nullable=True),
        sa.Column('dedup_key', sa.String(64), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_desktop_date', 'desktop_events', ['created_at'])
    op.create_index('idx_desktop_ip', 'desktop_events', ['user_ip'])
    op.create_index('idx_desktop_session', 'desktop_events', ['session_id'])
    op.create_index('idx_desktop_date_type', 'desktop_events', ['created_at', 'event_type'])
    op.create_index('idx_desktop_dedup', 'desktop_events', ['dedup_key'])

    # Create community_visits table
    op.create_table(
        'community_visits',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('page_path', sa.String(), nullable=False),
        sa.Column('user_ip', postgresql.INET(), nullable=False),
        sa.Column('user_ua', sa.Text(), nullable=True),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('community_user_id', sa.String(), nullable=True),
        sa.Column('referrer', sa.String(500), nullable=True),
        sa.Column('visited_at', sa.DateTime(), nullable=False),
        sa.Column('country', sa.String(50), nullable=True),
        sa.Column('city', sa.String(50), nullable=True),
        sa.Column('device_type', sa.String(20), nullable=True),
        sa.Column('dedup_key', sa.String(64), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_community_date', 'community_visits', ['visited_at'])
    op.create_index('idx_community_ip', 'community_visits', ['user_ip'])
    op.create_index('idx_community_user', 'community_visits', ['community_user_id'])
    op.create_index('idx_community_session', 'community_visits', ['session_id'])
    op.create_index('idx_community_date_page', 'community_visits', ['visited_at', 'page_path'])
    op.create_index('idx_community_dedup', 'community_visits', ['dedup_key'])


def downgrade():
    op.drop_index('idx_community_dedup', table_name='community_visits')
    op.drop_index('idx_community_date_page', table_name='community_visits')
    op.drop_index('idx_community_session', table_name='community_visits')
    op.drop_index('idx_community_user', table_name='community_visits')
    op.drop_index('idx_community_ip', table_name='community_visits')
    op.drop_index('idx_community_date', table_name='community_visits')
    op.drop_table('community_visits')

    op.drop_index('idx_desktop_dedup', table_name='desktop_events')
    op.drop_index('idx_desktop_date_type', table_name='desktop_events')
    op.drop_index('idx_desktop_session', table_name='desktop_events')
    op.drop_index('idx_desktop_ip', table_name='desktop_events')
    op.drop_index('idx_desktop_date', table_name='desktop_events')
    op.drop_table('desktop_events')

    op.drop_index('session_info_session_id_idx', table_name='session_info')
    op.drop_table('session_info')
    
    op.drop_index('idx_site_downloads_dedup', table_name='site_downloads')
    op.drop_index('idx_site_downloads_date_file', table_name='site_downloads')
    op.drop_index('site_downloads_session_id_idx', table_name='site_downloads')
    op.drop_index('idx_site_downloads_ip', table_name='site_downloads')
    op.drop_index('idx_site_downloads_file', table_name='site_downloads')
    op.drop_index('idx_site_downloads_date', table_name='site_downloads')
    op.drop_table('site_downloads')
    
    op.drop_index('idx_page_visits_dedup', table_name='page_visits')
    op.drop_index('idx_visits_date_page', table_name='page_visits')
    op.drop_index('page_visits_session_id_idx', table_name='page_visits')
    op.drop_index('idx_visits_page', table_name='page_visits')
    op.drop_index('idx_visits_ip', table_name='page_visits')
    op.drop_index('idx_visits_date', table_name='page_visits')
    op.drop_table('page_visits')
