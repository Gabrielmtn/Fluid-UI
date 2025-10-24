<?php
/**
 * Admin page for managing fluid simulation pages
 *
 * @package Fluid_Simulation
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Get all fluid simulation pages
$fluid_pages = get_posts(array(
    'post_type' => 'fluid_sim_page',
    'posts_per_page' => -1,
    'orderby' => 'date',
    'order' => 'DESC',
));
?>

<div class="wrap">
    <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

    <p><?php _e('Create and manage full-screen fluid simulation pages. Each page gets its own custom URL.', 'fluid-simulation'); ?></p>

    <!-- Create New Page Form -->
    <div class="card" style="max-width: 600px; margin: 20px 0;">
        <h2><?php _e('Create New Fluid Page', 'fluid-simulation'); ?></h2>
        <form id="create-fluid-page-form">
            <table class="form-table">
                <tr>
                    <th scope="row">
                        <label for="page-title"><?php _e('Page Title', 'fluid-simulation'); ?></label>
                    </th>
                    <td>
                        <input type="text" id="page-title" name="page-title" class="regular-text" required placeholder="My Awesome Fluid Simulation">
                        <p class="description"><?php _e('The name of your simulation page', 'fluid-simulation'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="page-slug"><?php _e('URL Slug', 'fluid-simulation'); ?></label>
                    </th>
                    <td>
                        <code><?php echo home_url('/'); ?></code><input type="text" id="page-slug" name="page-slug" class="regular-text" required placeholder="my-fluid-sim" pattern="[a-z0-9-]+" style="width: 200px;">
                        <p class="description"><?php _e('URL-friendly name (lowercase, no spaces, use hyphens)', 'fluid-simulation'); ?></p>
                    </td>
                </tr>
            </table>
            <p class="submit">
                <button type="submit" class="button button-primary"><?php _e('Create Page', 'fluid-simulation'); ?></button>
                <span class="spinner" style="float: none; margin: 0 10px;"></span>
            </p>
        </form>
        <div id="create-message" style="margin-top: 10px;"></div>
    </div>

    <!-- Existing Pages -->
    <h2><?php _e('Existing Fluid Pages', 'fluid-simulation'); ?></h2>

    <?php if (empty($fluid_pages)): ?>
        <p><?php _e('No fluid simulation pages created yet. Create one above!', 'fluid-simulation'); ?></p>
    <?php else: ?>
        <table class="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                    <th><?php _e('Title', 'fluid-simulation'); ?></th>
                    <th><?php _e('URL', 'fluid-simulation'); ?></th>
                    <th><?php _e('Created', 'fluid-simulation'); ?></th>
                    <th><?php _e('Actions', 'fluid-simulation'); ?></th>
                </tr>
            </thead>
            <tbody id="fluid-pages-list">
                <?php foreach ($fluid_pages as $page): ?>
                <tr data-page-id="<?php echo esc_attr($page->ID); ?>">
                    <td><strong><?php echo esc_html($page->post_title); ?></strong></td>
                    <td>
                        <a href="<?php echo esc_url(get_permalink($page->ID)); ?>" target="_blank">
                            <?php echo esc_html(str_replace(home_url('/'), '', get_permalink($page->ID))); ?>
                        </a>
                    </td>
                    <td><?php echo esc_html(get_the_date('', $page->ID)); ?></td>
                    <td>
                        <a href="<?php echo esc_url(get_permalink($page->ID)); ?>" target="_blank" class="button button-small"><?php _e('View', 'fluid-simulation'); ?></a>
                        <button class="button button-small button-link-delete delete-page-btn" data-page-id="<?php echo esc_attr($page->ID); ?>" data-page-title="<?php echo esc_attr($page->post_title); ?>">
                            <?php _e('Delete', 'fluid-simulation'); ?>
                        </button>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<style>
.card {
    background: #fff;
    border: 1px solid #c3c4c7;
    border-left-width: 4px;
    border-left-color: #2271b1;
    box-shadow: 0 1px 1px rgba(0,0,0,.04);
    padding: 20px;
}

.card h2 {
    margin-top: 0;
}

#create-message {
    padding: 10px;
    border-radius: 4px;
    display: none;
}

#create-message.success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    color: #155724;
}

#create-message.error {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
}
</style>

<script>
jQuery(document).ready(function($) {
    // Auto-generate slug from title
    $('#page-title').on('input', function() {
        var title = $(this).val();
        var slug = title.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 50);
        $('#page-slug').val(slug);
    });

    // Create page form
    $('#create-fluid-page-form').on('submit', function(e) {
        e.preventDefault();

        var $form = $(this);
        var $spinner = $form.find('.spinner');
        var $message = $('#create-message');
        var $submit = $form.find('button[type="submit"]');

        var title = $('#page-title').val().trim();
        var slug = $('#page-slug').val().trim();

        if (!title || !slug) {
            $message.removeClass('success').addClass('error').text('Please fill in all fields.').show();
            return;
        }

        $submit.prop('disabled', true);
        $spinner.addClass('is-active');
        $message.hide();

        $.ajax({
            url: ajaxurl,
            type: 'POST',
            data: {
                action: 'fluid_sim_create_page',
                nonce: '<?php echo wp_create_nonce('fluid_sim_nonce'); ?>',
                title: title,
                slug: slug
            },
            success: function(response) {
                $spinner.removeClass('is-active');
                $submit.prop('disabled', false);

                if (response.success) {
                    $message.removeClass('error').addClass('success')
                        .html('Page created successfully! <a href="' + response.data.url + '" target="_blank">View page</a>')
                        .show();

                    // Clear form
                    $form[0].reset();

                    // Reload page to show new entry
                    setTimeout(function() {
                        location.reload();
                    }, 1500);
                } else {
                    $message.removeClass('success').addClass('error')
                        .text('Error: ' + (response.data || 'Unknown error'))
                        .show();
                }
            },
            error: function() {
                $spinner.removeClass('is-active');
                $submit.prop('disabled', false);
                $message.removeClass('success').addClass('error')
                    .text('An error occurred. Please try again.')
                    .show();
            }
        });
    });

    // Delete page
    $('.delete-page-btn').on('click', function() {
        var $btn = $(this);
        var pageId = $btn.data('page-id');
        var pageTitle = $btn.data('page-title');

        if (!confirm('Are you sure you want to delete "' + pageTitle + '"? This cannot be undone.')) {
            return;
        }

        $btn.prop('disabled', true).text('Deleting...');

        $.ajax({
            url: ajaxurl,
            type: 'POST',
            data: {
                action: 'fluid_sim_delete_page',
                nonce: '<?php echo wp_create_nonce('fluid_sim_nonce'); ?>',
                post_id: pageId
            },
            success: function(response) {
                if (response.success) {
                    $('tr[data-page-id="' + pageId + '"]').fadeOut(function() {
                        $(this).remove();

                        // Check if table is empty
                        if ($('#fluid-pages-list tr').length === 0) {
                            location.reload();
                        }
                    });
                } else {
                    alert('Error deleting page: ' + (response.data || 'Unknown error'));
                    $btn.prop('disabled', false).text('Delete');
                }
            },
            error: function() {
                alert('An error occurred. Please try again.');
                $btn.prop('disabled', false).text('Delete');
            }
        });
    });
});
</script>
