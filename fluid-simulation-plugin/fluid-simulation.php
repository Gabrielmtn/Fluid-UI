<?php
/**
 * Plugin Name: Fluid Simulation
 * Plugin URI: https://github.com/Gabrielmtn/Fluid-UI
 * Description: Interactive WebGL2-based fluid simulation with advanced controls, layer management, and recording capabilities.
 * Version: 1.0.6
 * Author: Your Name
 * Author URI: https://github.com/Gabrielmtn
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: fluid-simulation
 * Domain Path: /languages
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('FLUID_SIM_VERSION', '1.0.6');
define('FLUID_SIM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('FLUID_SIM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('FLUID_SIM_PLUGIN_FILE', __FILE__);

/**
 * Main Fluid Simulation Plugin Class
 */
class Fluid_Simulation_Plugin {

    /**
     * Instance of this class
     */
    private static $instance = null;

    /**
     * Get instance of the plugin
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Register custom post type
        add_action('init', array($this, 'register_custom_post_type'));

        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));

        // Frontend hooks
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        add_action('template_redirect', array($this, 'intercept_fluid_page'));
        add_shortcode('fluid_simulation', array($this, 'render_shortcode'));

        // AJAX hooks
        add_action('wp_ajax_fluid_sim_save_palette', array($this, 'save_palette'));
        add_action('wp_ajax_fluid_sim_get_palette', array($this, 'get_palette'));
        add_action('wp_ajax_fluid_sim_create_page', array($this, 'ajax_create_page'));
        add_action('wp_ajax_fluid_sim_delete_page', array($this, 'ajax_delete_page'));
    }

    /**
     * Register custom post type for fluid simulation pages
     */
    public function register_custom_post_type() {
        $args = array(
            'labels' => array(
                'name' => __('Fluid Pages', 'fluid-simulation'),
                'singular_name' => __('Fluid Page', 'fluid-simulation'),
            ),
            'public' => true,
            'publicly_queryable' => true,
            'show_ui' => false, // We'll use our own admin interface
            'show_in_menu' => false,
            'query_var' => true,
            'rewrite' => array('slug' => 'fluid'),
            'capability_type' => 'post',
            'has_archive' => false,
            'hierarchical' => false,
            'supports' => array('title'),
        );
        register_post_type('fluid_sim_page', $args);
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        // Main menu - Simulator
        add_menu_page(
            __('Fluid Simulation', 'fluid-simulation'),
            __('Fluid Simulation', 'fluid-simulation'),
            'manage_options',
            'fluid-simulation',
            array($this, 'render_admin_page'),
            'dashicons-admin-customizer',
            30
        );

        // Submenu - Simulator (same as main)
        add_submenu_page(
            'fluid-simulation',
            __('Simulator', 'fluid-simulation'),
            __('Simulator', 'fluid-simulation'),
            'manage_options',
            'fluid-simulation'
        );

        // Submenu - Manage Pages
        add_submenu_page(
            'fluid-simulation',
            __('Manage Pages', 'fluid-simulation'),
            __('Manage Pages', 'fluid-simulation'),
            'manage_options',
            'fluid-simulation-pages',
            array($this, 'render_pages_admin')
        );
    }

    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {
        // Load on our admin pages
        if ('toplevel_page_fluid-simulation' !== $hook && 'fluid-simulation_page_fluid-simulation-pages' !== $hook) {
            return;
        }

        // Enqueue CSS
        wp_enqueue_style(
            'fluid-simulation-css',
            FLUID_SIM_PLUGIN_URL . 'assets/css/fluid-simulation.css',
            array(),
            FLUID_SIM_VERSION
        );

        // Only load simulation JS on simulator page
        if ('toplevel_page_fluid-simulation' === $hook) {
            wp_enqueue_script(
                'fluid-simulation-js',
                FLUID_SIM_PLUGIN_URL . 'assets/js/fluid-simulation.js',
                array(),
                FLUID_SIM_VERSION,
                true
            );

            wp_enqueue_media();
        }

        // Pass data to JavaScript
        wp_localize_script('fluid-simulation-js', 'fluidSimData', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('fluid_sim_nonce'),
            'pluginUrl' => FLUID_SIM_PLUGIN_URL
        ));
    }

    /**
     * Enqueue frontend assets
     */
    public function enqueue_frontend_assets() {
        // Check if we're on a fluid simulation page
        if (is_singular('fluid_sim_page') || has_shortcode(get_post()->post_content ?? '', 'fluid_simulation')) {
            wp_enqueue_style(
                'fluid-simulation-css',
                FLUID_SIM_PLUGIN_URL . 'assets/css/fluid-simulation.css',
                array(),
                FLUID_SIM_VERSION
            );

            wp_enqueue_style(
                'fluid-simulation-fullscreen-css',
                FLUID_SIM_PLUGIN_URL . 'assets/css/fluid-simulation-fullscreen.css',
                array('fluid-simulation-css'),
                FLUID_SIM_VERSION
            );

            wp_enqueue_script(
                'fluid-simulation-js',
                FLUID_SIM_PLUGIN_URL . 'assets/js/fluid-simulation.js',
                array(),
                FLUID_SIM_VERSION,
                true
            );

            wp_localize_script('fluid-simulation-js', 'fluidSimData', array(
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('fluid_sim_nonce'),
                'pluginUrl' => FLUID_SIM_PLUGIN_URL
            ));
        }
    }

    /**
     * Intercept fluid simulation pages and display full-screen template
     */
    public function intercept_fluid_page() {
        if (is_singular('fluid_sim_page')) {
            include FLUID_SIM_PLUGIN_DIR . 'templates/fullscreen-page.php';
            exit;
        }
    }

    /**
     * Render admin page (simulator)
     */
    public function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        include FLUID_SIM_PLUGIN_DIR . 'admin/templates/admin-page.php';
    }

    /**
     * Render pages management admin
     */
    public function render_pages_admin() {
        if (!current_user_can('manage_options')) {
            return;
        }

        include FLUID_SIM_PLUGIN_DIR . 'admin/templates/pages-admin.php';
    }

    /**
     * Render shortcode
     */
    public function render_shortcode($atts) {
        $atts = shortcode_atts(array(
            'width' => '800',
            'height' => '600',
        ), $atts, 'fluid_simulation');

        ob_start();
        include FLUID_SIM_PLUGIN_DIR . 'includes/shortcode-template.php';
        return ob_get_clean();
    }

    /**
     * AJAX: Create new fluid simulation page
     */
    public function ajax_create_page() {
        check_ajax_referer('fluid_sim_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $title = isset($_POST['title']) ? sanitize_text_field($_POST['title']) : '';
        $slug = isset($_POST['slug']) ? sanitize_title($_POST['slug']) : '';

        if (empty($title) || empty($slug)) {
            wp_send_json_error('Title and slug are required');
        }

        // Check if slug already exists
        $existing = get_page_by_path($slug, OBJECT, 'fluid_sim_page');
        if ($existing) {
            wp_send_json_error('A page with this URL already exists');
        }

        $post_id = wp_insert_post(array(
            'post_title' => $title,
            'post_name' => $slug,
            'post_type' => 'fluid_sim_page',
            'post_status' => 'publish',
        ));

        if (is_wp_error($post_id)) {
            wp_send_json_error($post_id->get_error_message());
        }

        // Flush rewrite rules to make the new page accessible
        flush_rewrite_rules();

        wp_send_json_success(array(
            'id' => $post_id,
            'title' => $title,
            'slug' => $slug,
            'url' => get_permalink($post_id),
        ));
    }

    /**
     * AJAX: Delete fluid simulation page
     */
    public function ajax_delete_page() {
        check_ajax_referer('fluid_sim_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;

        if (!$post_id) {
            wp_send_json_error('Invalid page ID');
        }

        $result = wp_delete_post($post_id, true);

        if (!$result) {
            wp_send_json_error('Failed to delete page');
        }

        wp_send_json_success();
    }

    /**
     * AJAX: Save palette data
     */
    public function save_palette() {
        check_ajax_referer('fluid_sim_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $palette = isset($_POST['palette']) ? sanitize_text_field($_POST['palette']) : '';
        update_option('fluid_sim_palette', $palette);

        wp_send_json_success();
    }

    /**
     * AJAX: Get palette data
     */
    public function get_palette() {
        check_ajax_referer('fluid_sim_nonce', 'nonce');

        $palette = get_option('fluid_sim_palette', '');
        wp_send_json_success($palette);
    }
}

// Initialize the plugin
function fluid_simulation_init() {
    return Fluid_Simulation_Plugin::get_instance();
}

// Start the plugin
add_action('plugins_loaded', 'fluid_simulation_init');

// Activation hook
register_activation_hook(__FILE__, 'fluid_simulation_activate');
function fluid_simulation_activate() {
    // Register post type
    $plugin = Fluid_Simulation_Plugin::get_instance();
    $plugin->register_custom_post_type();

    // Set default options
    add_option('fluid_sim_palette', '');

    // Flush rewrite rules
    flush_rewrite_rules();
}

// Deactivation hook
register_deactivation_hook(__FILE__, 'fluid_simulation_deactivate');
function fluid_simulation_deactivate() {
    flush_rewrite_rules();
}
